import {temporaryNotificationDismiss} from "natlang:services";
import type {NotificationDismissal} from "../types.js";
/** Clean up the notification identified by its host receipt. */
export default async function dismissAssignedNotification(operationId: string, notificationId: string):Promise<NotificationDismissal>{
 return temporaryNotificationDismiss.dismiss(operationId, notificationId);
}
