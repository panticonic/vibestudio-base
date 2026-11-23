import discoverDevelopmentAudit from "./reviewDevelopmentAudit/discoverDevelopmentAudit.js";
import inspectDevelopmentRuns from "./reviewDevelopmentAudit/inspectDevelopmentRuns.js";
import chooseDevelopmentRun from "./reviewDevelopmentAudit/chooseDevelopmentRun.nl";
import assessDevelopmentRepair from "./reviewDevelopmentAudit/assessDevelopmentRepair.nl";
import keepDevelopmentRepair from "./reviewDevelopmentAudit/keepDevelopmentRepair.js";
import type {DevelopmentAuditFindings} from "./reviewDevelopmentAudit/types.js";
/** Native observations feed semantic run selection and journal assessment; the actual keep receipt is preserved. */
export default async function reviewDevelopmentAudit(goal:string):Promise<DevelopmentAuditFindings>{
 const assignment=await discoverDevelopmentAudit();
 const observed=await inspectDevelopmentRuns(assignment);
 const choice=await chooseDevelopmentRun(assignment,observed);
 const assessment=await assessDevelopmentRepair(assignment,observed,choice);
 const selected=[observed.requested,observed.alternate].find(run=>run?.id===choice.runId);
 const receipt=assessment.disposition==="keep-repair"&&selected?await keepDevelopmentRepair(selected):null;
 return {runId:choice.runId,assessment,receipt};
}
