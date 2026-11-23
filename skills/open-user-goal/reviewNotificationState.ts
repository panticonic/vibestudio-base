import locateNotificationLane from "./reviewNotificationState/locateNotificationLane.nl";
import readNotificationLifecycle from "./reviewNotificationState/readNotificationLifecycle.nl";
import chooseNotificationAction from "./reviewNotificationState/chooseNotificationAction.nl";
import finishNotificationReview from "./reviewNotificationState/finishNotificationReview.js";
import type {NotificationStateOutcome} from "./types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewNotificationState(goal:string):Promise<NotificationStateOutcome>{
 const lane=await locateNotificationLane(goal);
 const lifecycle=await readNotificationLifecycle(lane);
 const decision=await chooseNotificationAction(goal,lifecycle);
 return finishNotificationReview(lifecycle,decision);
}
