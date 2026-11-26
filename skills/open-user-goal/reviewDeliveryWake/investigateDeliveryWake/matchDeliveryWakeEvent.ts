import type {DeliveryWakeAssignment,DeliveryWakeEvidence,DeliveryMatch} from "../types.js";
/** Preserve the native event itself after exact request/kind/address matching. */
export default function matchDeliveryWakeEvent(assignment:DeliveryWakeAssignment,evidence:DeliveryWakeEvidence):DeliveryMatch {
 const events=evidence.events.filter(row=>row.name===assignment.request&&row.kind===assignment.kind&&row.recipients.includes(assignment.recipient));
 if(events.length!==1)return{event:null,mailbox:null};
 const event=events[0]!,rows=evidence.mailbox.filter(row=>row.event===event.id&&row.recipient===assignment.recipient&&row.revision===assignment.revision);
 return rows.length>1?{event:null,mailbox:null}:{event,mailbox:rows[0]??null};
}
