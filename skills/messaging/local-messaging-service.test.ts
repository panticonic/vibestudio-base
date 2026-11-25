import {expect,it,vi} from "vitest";
import {createLocalMessaging} from "./local-messaging-service.js";
it("uses an explicit recipient phrase at both inspection and final owned delivery admission",async()=>{
 const lease={fixtureId:"owned",channelId:"native-channel",senderParticipantId:"sender",operationId:"native-operation",active:true,recipients:[{ref:"@sam-intake",participantId:"sam",kind:"agent" as const}]};
 let rows=[{ref:"@sam-intake",kind:"agent",note:"Sam intake controller"},{ref:"@sam-audit",kind:"agent",note:"Sam audit observer"},{ref:"@lena-ops",kind:"agent",note:"Lena operations"}];
 const notify=vi.fn(async()=>({messageId:"actual-message",channelId:lease.channelId}));
 const messaging=createLocalMessaging({lease,assertOwnedFixture:async()=>lease,addressees:async()=>rows,notify,inspectCommitted:vi.fn()});
 const snapshot=await messaging.read.inspect("@sam-intake");
 expect(snapshot.resolution).toMatchObject({kind:"ref",ref:"@sam-intake"});
 const receipt=await messaging.send.send(snapshot.revision,"@sam-intake","@sam-intake","Lena approved the roster at 14:30 UTC");
 expect(receipt.to).toBe("@sam-intake");
 expect(notify).toHaveBeenCalledExactlyOnceWith({content:"Lena approved the roster at 14:30 UTC",to:["@sam-intake"],alert:"none"},lease.operationId);
 await expect(messaging.send.send(snapshot.revision,"Sam","@sam-intake","another note")).rejects.toThrow("exact intended recipient");
 await expect(messaging.send.send(snapshot.revision,"@sam-absent","@sam-intake","another note")).rejects.toThrow("exact intended recipient");
 rows=rows.filter(row=>row.ref!=="@sam-intake");
 await expect(messaging.send.send(snapshot.revision,"@sam-intake","@sam-intake","another note")).rejects.toThrow("Roster changed");
 expect(notify).toHaveBeenCalledTimes(1);
});
