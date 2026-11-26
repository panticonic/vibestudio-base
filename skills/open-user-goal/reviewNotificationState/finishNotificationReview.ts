import {notificationState} from "natlang:services";
import type {NotificationLifecycle,NotificationDecision,NotificationStateOutcome} from "../types.js";
/** Apply an exact authorized acknowledgment while retaining the requested finding. */
export default async function finishNotificationReview(lifecycle:NotificationLifecycle,decision:NotificationDecision):Promise<NotificationStateOutcome>{
 let acknowledgment:NotificationStateOutcome["acknowledgment"]=null;
 if(decision.action==="acknowledge"){
  const lane=lifecycle.current?.lane,{id,revision}=decision.finding;
  if(!lane||id===null||revision===null)throw new Error("Acknowledgment requires the actual current lane and exact notification revision");
  acknowledgment=await notificationState.acknowledge(lane,id,revision);
  await notificationState.read(lane);
 }
 return {finding:decision.finding,explanation:decision.reason,acknowledgment};
}
