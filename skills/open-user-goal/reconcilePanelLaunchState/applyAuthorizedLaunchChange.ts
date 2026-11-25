import bindLaunchAuthority from "./workspace/bindLaunchAuthority.js";
import applyLaunchPatch from "./workspace/applyLaunchPatch.js";
import reviewLaunchAuthority from "./reviewLaunchAuthority.js";
import type {LaunchApplication,LaunchDecision,LaunchPlan,LaunchSnapshot} from "./types.js";
/** Bind native write authority to the exact observed state and requested patch. */
export default async function applyAuthorizedLaunchChange(plan:LaunchPlan,current:LaunchSnapshot,decision:LaunchDecision):Promise<LaunchApplication>{
 if(!decision.attempt)return {preflight:null,effect:null};
 const request=await bindLaunchAuthority(plan.panelId,current.digest,plan.patch);
 if(!request)return {preflight:null,effect:null};
 const report=await reviewLaunchAuthority(request);
 const preflight={request,report};
 return {preflight,effect:report.status==="eligible"?await applyLaunchPatch(plan.panelId,current.digest,plan.patch):null};
}
