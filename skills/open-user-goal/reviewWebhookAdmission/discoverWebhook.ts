import {webhookAdmissionEvidence} from "natlang:services";
import type {WebhookAdmissionAssignment} from "./types.js";
/** Identify one authorized local registration and its intended metadata review. */
export default async function discoverWebhook():Promise<WebhookAdmissionAssignment>{
 return webhookAdmissionEvidence.discover();
}
