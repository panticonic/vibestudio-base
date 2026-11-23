import {webhookAdmissionEvidence} from "natlang:services";
import type {WebhookAdmissionAssignment, WebhookAdmissionEvidence} from "../types.js";
/** Read one scoped redacted native webhook record set. */
export default async function readWebhookEvidence(assignment: WebhookAdmissionAssignment):Promise<WebhookAdmissionEvidence>{
 return webhookAdmissionEvidence.inspect(assignment.id);
}
