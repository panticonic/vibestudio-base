import discoverWebhook from "./reviewWebhookAdmission/discoverWebhook.js";
import stageWebhookAudit from "./reviewWebhookAdmission/stageWebhookAudit.js";
import inspectWebhookStatus from "./reviewWebhookAdmission/inspectWebhookStatus.nl";
import matchRegistration from "./reviewWebhookAdmission/matchRegistration.nl";
import assessWebhookAdmission from "./reviewWebhookAdmission/assessWebhookAdmission.nl";
import type {WebhookAdmissionOutcome} from "./reviewWebhookAdmission/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewWebhookAdmission(goal:string):Promise<WebhookAdmissionOutcome>{
 const assignment=await discoverWebhook();
 const evidence=await inspectWebhookStatus(assignment);
 const binding=await matchRegistration(assignment,evidence);
 const assessment=await assessWebhookAdmission(assignment,binding);
 const handoff=assessment.disposition==="stage-audit"?await stageWebhookAudit(assignment,evidence,binding,assessment):null;
 return {assessment,handoff};
}
