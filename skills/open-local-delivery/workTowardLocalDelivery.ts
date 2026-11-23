import {localDeliveryCatalog} from "natlang:services";
import chooseConversations from "./workTowardLocalDelivery/chooseConversations.nl";
import inspectConversation from "./workTowardLocalDelivery/inspectConversation.js";
import reconsider from "./workTowardLocalDelivery/reconsider.nl";
import decideDelivery from "./workTowardLocalDelivery/decideDelivery.nl";
import bindReport from "./workTowardLocalDelivery/bindReport.js";
import completeDelivery from "./workTowardLocalDelivery/completeDelivery.nl";
import type {LocalDeliveryReport} from "./types.js";

export default async function workTowardLocalDelivery(goal:string):Promise<LocalDeliveryReport>{
 const conversations=await localDeliveryCatalog.discover();
 const choices=await chooseConversations(goal,conversations),observations=[];
 for(const choice of choices)observations.push(await inspectConversation(choice));
 let further=await reconsider(goal,conversations,observations);
 if(further){observations.push(await inspectConversation(further));further=await reconsider(goal,conversations,observations);if(further)observations.push(await inspectConversation(further));}
 const decision=await decideDelivery(goal,observations);
 const report=bindReport(decision,observations);
 if(!decision.sendRoomId)return report;
 const target=observations.find(row=>row.room.id===decision.sendRoomId);
 if(!target||!target.room.maySend||target.resolution?.kind!=="ref")return {...report,status:"held",reason:"The requested follow-up lacks one exact owned recipient."};
 const delivery=await completeDelivery(goal,observations,target);
 const readback=delivery.readback;
 const confirmed=readback?.acknowledged&&readback.roomId===target.room.id&&readback.recipientRef===target.resolution.ref;
 return {...report,status:confirmed?"delivered":"unconfirmed",delivery};
}
