import {temporaryNotificationShow} from "natlang:services";
import type {NotificationAcceptance} from "../types.js";
/** Request the assigned temporary notification and obtain its host acceptance receipt. */
export default async function showAssignedNotification(operationId: string):Promise<NotificationAcceptance>{
 return temporaryNotificationShow.show(operationId);
}
