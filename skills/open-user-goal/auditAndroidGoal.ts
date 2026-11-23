import readAndroidAuditScope from "./auditAndroidGoal/readAndroidAuditScope.js";
import planAndroidGoalAudit from "./auditAndroidGoal/planAndroidGoalAudit.nl";
import auditAndroidRuntime from "./auditAndroidGoal/installed/auditAndroidRuntime.nl";
import type {AndroidGoalAuditReport} from "./auditAndroidGoal/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function auditAndroidGoal(goal:string):Promise<AndroidGoalAuditReport>{
 const scope=await readAndroidAuditScope(goal);
 const request=await planAndroidGoalAudit(goal,scope);
 return auditAndroidRuntime(request);
}
