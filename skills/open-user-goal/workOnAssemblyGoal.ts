import readAssemblyInventory from "./workOnAssemblyGoal/workspace/readAssemblyInventory.js";
import readAssemblyUnits from "./workOnAssemblyGoal/workspace/readAssemblyUnits.js";
import verifyAssemblyBuild from "./workOnAssemblyGoal/workspace/verifyAssemblyBuild.js";
import stageAssemblyDraft from "./workOnAssemblyGoal/workspace/stageAssemblyDraft.js";
import chooseAssemblyCandidate from "./workOnAssemblyGoal/chooseAssemblyCandidate.nl";
import completeAssemblyScope from "./workOnAssemblyGoal/completeAssemblyScope.nl";
import interpretDependencies from "./workOnAssemblyGoal/interpretDependencies.nl";
import chooseAssemblyVerification from "./workOnAssemblyGoal/chooseAssemblyVerification.nl";
import decideAssemblyOutcome from "./workOnAssemblyGoal/decideAssemblyOutcome.nl";
import shouldStageAssemblyDraft from "./workOnAssemblyGoal/shouldStageAssemblyDraft.nl";
import type {AssemblyReport,AssemblyBuildReceipt} from "./workOnAssemblyGoal/types.js";
export default async function workOnAssemblyGoal(goal:string):Promise<AssemblyReport>{
 const inventory=await readAssemblyInventory(),scope=await chooseAssemblyCandidate(goal,inventory);
 const sources=await readAssemblyUnits(scope.inspect,inventory.head);
 const additional=await completeAssemblyScope(goal,inventory,scope,sources);
 if(additional.length)sources.push(...await readAssemblyUnits(additional,inventory.head));
 const dependencies=await interpretDependencies(goal,scope,sources);
 const selected=await chooseAssemblyVerification(goal,inventory,scope,dependencies),builds:AssemblyBuildReceipt[]=[];
 for(const unit of selected){const receipt=await verifyAssemblyBuild(unit,inventory.head);if(receipt)builds.push(receipt);}
 const plan=await decideAssemblyOutcome(goal,inventory,scope,dependencies,builds);
 const handoff=await shouldStageAssemblyDraft(goal,inventory.mayStage,plan)?await stageAssemblyDraft(plan):null;
 return {plan,handoff};
}
