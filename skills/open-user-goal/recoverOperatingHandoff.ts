import workOnEvalHandoffGoal from "./workOnEvalHandoffGoal.js";
import workOnRecoveryHandoff from "./workOnRecoveryHandoff.nl";
import type {RecoveryHandoffOutcome} from "./workOnRecoveryHandoff/types.js";
/** Semantic recovery and handoff resolution share the exact verified application result. */
export default async function recoverOperatingHandoff(goal:string):Promise<RecoveryHandoffOutcome>{
 return workOnRecoveryHandoff(goal,await workOnEvalHandoffGoal(goal));
}
