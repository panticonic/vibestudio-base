import {notificationState} from "natlang:services";
import type {NotificationLifecycle,NotificationDecision,NotificationStateOutcome} from "../types.js";
/** Apply one exact authorized acknowledgment and independently reread its lane. */
export default async function finishNotificationReview(lifecycle:NotificationLifecycle,decision:NotificationDecision):Promise<NotificationStateOutcome>{
 if(decision.action!=="acknowledge")return decision;
 const lane=lifecycle.current?.lane,{id,revision}=decision.finding;
 if(!lane||id===null||revision===null)throw new Error("Acknowledgment requires the actual current lane and exact notification revision");
 const acknowledgment=await notificationState.acknowledge(lane,id,revision);
 await notificationState.read(lane);
 return acknowledgment;
}
