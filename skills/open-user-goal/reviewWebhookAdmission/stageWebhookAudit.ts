import {webhookAdmissionHandoff} from "natlang:services";
import type {WebhookAdmissionAssessment, WebhookAdmissionAssignment, WebhookAdmissionBinding, WebhookAdmissionEvidence, WebhookAdmissionReceipt} from "./types.js";
/** Stage a small private note from exact verified registration metadata. */
export default async function stageWebhookAudit(assignment: WebhookAdmissionAssignment, evidence: WebhookAdmissionEvidence, binding: WebhookAdmissionBinding, assessment: WebhookAdmissionAssessment):Promise<WebhookAdmissionReceipt>{
 return webhookAdmissionHandoff.stage(assignment.id, evidence.retainedDigest, binding.row, assessment.disposition);
}
