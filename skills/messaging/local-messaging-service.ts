import { resolveAddressee } from "./resolve-addressee.js";
import { sha256Hex } from "@vibestudio/content-addressing";
import type { Addressee, Snapshot, Receipt, DeliveryEvidence } from "../vibestudio-workflows/runWorkflow/routeMessage/types.js";

export interface OwnedMessagingLease {
  fixtureId: string;
  channelId: string;
  senderParticipantId: string;
  operationId: string;
  active: boolean;
  recipients: Array<{ ref: string; participantId: string; kind: "agent" }>;
}

/** Requires actual owner-bound discovery/notify/read ports; no alternate message implementation lives here. */
export function createLocalMessaging(options:{
  lease: OwnedMessagingLease;
  assertOwnedFixture(): Promise<OwnedMessagingLease>;
  addressees(): Promise<Addressee[]>;
  notify(input:{content:string;to:string[];alert:"none"},operationId:string):Promise<{messageId:string;channelId:string}>;
  inspectCommitted(receipt:Receipt|null):Promise<DeliveryEvidence>;
}) {
  const original=structuredClone(options.lease);
  const live=async()=>{
    const value=await options.assertOwnedFixture();
    if(!value.active || value.fixtureId!==original.fixtureId || value.channelId!==original.channelId ||
       value.senderParticipantId!==original.senderParticipantId || value.operationId!==original.operationId ||
       value.recipients.some(p=>p.kind!=="agent") || JSON.stringify(value.recipients)!==JSON.stringify(original.recipients))
      throw new Error("Owned synthetic messaging fixture changed or was released.");
    return value;
  };
  const snapshot=async(recipientPhrase:string):Promise<Snapshot>=>{
    const lease=await live(),rows=await options.addressees();
    await live();
    const revision=sha256Hex(new TextEncoder().encode(JSON.stringify([...rows].sort((a,b)=>a.ref.localeCompare(b.ref)))));
    // The original exact resolver is authoritative; no model choice replaces it.
    const resolution=resolveAddressee(recipientPhrase,rows);
    return {fixtureId:lease.fixtureId,channelId:lease.channelId,revision,rows,resolution};
  };
  let sentArgs:string|undefined;
  let result:Promise<Receipt>|undefined;
  return {
    read:Object.freeze({
      inspect:snapshot,
      async inspectDelivery(receipt:Receipt|null) {
        await live();
        if(receipt && (receipt.channelId!==original.channelId || !original.recipients.some(p=>p.ref===receipt.to)))
          throw new Error("Receipt is outside the owned synthetic conversation.");
        const observed=await options.inspectCommitted(receipt);
        await live();
        if(observed.channelId!==original.channelId) throw new Error("Committed observation names another channel.");
        return structuredClone(observed);
      },
    }),
    send:Object.freeze({
      async send(revision:string,recipientPhrase:string,ref:string,content:string):Promise<Receipt> {
        if(!content.trim()) throw new Error("Supply the requested message text.");
        const current=await snapshot(recipientPhrase);
        if(current.revision!==revision) throw new Error("Roster changed; inspect the current recipients before delivery.");
        if(current.resolution.kind!=="ref" || current.resolution.ref!==ref || (!original.recipients.some(p=>p.ref===ref) || !current.rows.some(row=>row.ref===ref && row.kind==="agent")))
          throw new Error("The exact intended recipient is not an owned synthetic agent; keep the note unsent.");
        const key=JSON.stringify([revision,recipientPhrase,ref,content]);
        if(result) {
          if(key!==sentArgs) throw new Error("This owned task already has a delivery operation; inspect its actual outcome.");
          return result;
        }
        sentArgs=key;
        result=(async()=>{
          const actual=await options.notify({content,to:[ref],alert:"none"},original.operationId);
          if(!actual.messageId || actual.channelId!==original.channelId) throw new Error("Notify returned a different conversation or no actual message id.");
          return {messageId:actual.messageId,channelId:actual.channelId,to:ref,alert:"none" as const};
        })();
        return result;
      },
    }),
  };
}
