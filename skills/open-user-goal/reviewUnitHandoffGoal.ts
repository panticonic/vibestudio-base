import {unitHandoff} from "natlang:services";
import chooseUnit from "./reviewUnitHandoffGoal/chooseUnit.nl";
import reviewDesign from "./reviewUnitHandoffGoal/reviewDesign.nl";
import reviewIdentity from "./reviewUnitHandoffGoal/reviewIdentity.nl";
import completeHandoff from "./reviewUnitHandoffGoal/completeHandoff.nl";
import applicationResult from "./reviewUnitHandoffGoal/applicationResult.js";
import type {UnitHandoffResult} from "./reviewUnitHandoffGoal/types.js";

/** Compose the scoped manifest, lifecycle and identity policies without prescribing their findings. */
export default async function reviewUnitHandoffGoal(goal:string):Promise<UnitHandoffResult>{
 const plan=await chooseUnit(goal,await unitHandoff.discover());
 if(!plan.path)return applicationResult({decision:"held",plan,observation:null,design:null,identity:null,reason:plan.reason});
 const observation=await unitHandoff.begin(plan.path);
 if(observation.unit.path!==plan.path)throw new Error("The unit handoff observation belongs to another installed path");
 const design=plan.focus!=="identity"||plan.inspectLifecycle?await reviewDesign(goal,plan,observation):null;
 const identity=plan.focus!=="manifest"?await reviewIdentity(goal,plan,observation,design):null;
 return applicationResult(await completeHandoff(goal,plan,observation,design,identity));
}
