import reconcileLocalGoal from "./workOnLocalReconciliationGoal/project/reconcileLocalGoal.nl";
import readWindow from "./workOnLocalReconciliationGoal/project/reconcileLocalGoal/discoverWindow/readWindow.js";
import assembleHandoff from "./workOnLocalReconciliationGoal/scratch/assembleHandoff.nl";
import type {LocalReconciliationGoalReport} from "./types.js";
export default async function workOnLocalReconciliationGoal(goal:string):Promise<LocalReconciliationGoalReport>{
 const preparation=await reconcileLocalGoal(goal);
 const completed=preparation.evidence?await assembleHandoff(preparation.evidence):null;
 const handoff:LocalReconciliationGoalReport["handoff"]=completed?.status==="staged"&&completed.artifact?{status:"staged",artifact:completed.artifact}:{status:preparation.handoffRequested?"held":"none",artifact:null};
 return {integration:preparation.integration,window:await readWindow(),handoff,archive:preparation.archive};
}
