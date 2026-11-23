import discoverIntegrationReview from "./workOnApiReadinessGoal/workspace/discoverIntegrationReview.js";
import readIntegrationSelection from "./workOnApiReadinessGoal/workspace/readIntegrationSelection.js";
import openQuietIntegrationPlan from "./workOnApiReadinessGoal/workspace/openQuietIntegrationPlan.js";
import readQuietIntegrationAudit from "./workOnApiReadinessGoal/workspace/readQuietIntegrationAudit.js";
import stageIntegrationReadiness from "./workOnApiReadinessGoal/workspace/stageIntegrationReadiness.js";
import chooseIntegrationProfile from "./workOnApiReadinessGoal/chooseIntegrationProfile.nl";
import checkIntegrationSelection from "./workOnApiReadinessGoal/checkIntegrationSelection.nl";
import reviewQuietCredentials from "./workOnApiReadinessGoal/reviewQuietCredentials.nl";
import decideApiReadiness from "./workOnApiReadinessGoal/decideApiReadiness.nl";
import applicationResult from "./workOnApiReadinessGoal/applicationResult.js";
import type {ApiReadinessResult,ReadinessReport} from "./workOnApiReadinessGoal/types.js";
export default async function workOnApiReadinessGoal(goal:string):Promise<ApiReadinessResult>{
 const index=await discoverIntegrationReview(),choice=await chooseIntegrationProfile(goal,index);
 const earlier=await readIntegrationSelection(index.scope.channelId),current=await readIntegrationSelection(index.scope.channelId);
 if(!earlier||!current)throw new Error("The owned integration selection frontier is unavailable");
 const selection=await checkIntegrationSelection(index,choice,earlier,current);
 let review:ReadinessReport["review"]=null,audit:ReadinessReport["audit"]=null;
 if(selection.reason==="selected"&&choice.profileId&&selection.message){
  const request=await openQuietIntegrationPlan(choice.profileId,selection.message);
  if(request){review=await reviewQuietCredentials(request);audit=await readQuietIntegrationAudit(request.operationId);}
 }
 const plan=await decideApiReadiness(goal,index,choice,current,selection,review,audit);
 const report:ReadinessReport={plan,review,audit,handoff:null};
 const handoff=plan.action==="stage"?await stageIntegrationReadiness(report):null;
 return applicationResult(plan,review,audit,handoff);
}
