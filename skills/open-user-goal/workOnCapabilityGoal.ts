import readPlanningState from "./workOnCapabilityGoal/workspace/readPlanningState.js";
import docHelp from "./workOnCapabilityGoal/help/docHelp.nl";
import chooseDocRequests from "./workOnCapabilityGoal/chooseDocRequests.nl";
import collectCapabilityEvidence from "./workOnCapabilityGoal/workspace/collectCapabilityEvidence.nl";
import synthesizeCapabilityPlan from "./workOnCapabilityGoal/workspace/synthesizeCapabilityPlan.nl";
import shouldStageCapabilityPlan from "./workOnCapabilityGoal/shouldStageCapabilityPlan.nl";
import stageCapabilityPlan from "./workOnCapabilityGoal/workspace/stageCapabilityPlan.js";
import type {CapabilityGoalReport} from "./workOnCapabilityGoal/types.js";
export default async function workOnCapabilityGoal(goal:string):Promise<CapabilityGoalReport>{
 const state=await readPlanningState();
 const requests=await chooseDocRequests(goal,await docHelp.keywords(goal),state.memo);
 const evidence=await collectCapabilityEvidence(goal,requests);
 const plan=await synthesizeCapabilityPlan(goal,state,evidence);
 const handoff=await shouldStageCapabilityPlan(goal,state.stageAuthorized,plan)?await stageCapabilityPlan(plan):null;
 return {plan,handoff};
}
