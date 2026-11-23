import discoverEvalJobs from "./workOnEvalHandoffGoal/journal/discoverEvalJobs.js";
import openEvalAttempt from "./workOnEvalHandoffGoal/journal/openEvalAttempt.js";
import retryOpenEval from "./workOnEvalHandoffGoal/journal/retryOpenEval.js";
import stageEvalHandoff from "./workOnEvalHandoffGoal/journal/stageEvalHandoff.js";
import reviewEvalRecovery from "./workOnEvalHandoffGoal/reviewer/reviewEvalRecovery.nl";
import chooseEvalJob from "./workOnEvalHandoffGoal/chooseEvalJob.nl";
import chooseEvalAttempts from "./workOnEvalHandoffGoal/chooseEvalAttempts.nl";
import decideEvalHandoff from "./workOnEvalHandoffGoal/decideEvalHandoff.nl";
import shouldStageEvalResult from "./workOnEvalHandoffGoal/shouldStageEvalResult.nl";
import confirmedEvalResult from "./workOnEvalHandoffGoal/confirmedEvalResult.js";
import applicationResult from "./workOnEvalHandoffGoal/applicationResult.js";
import type {EvalRecoveryResult,EvalTrial} from "./workOnEvalHandoffGoal/types.js";

/** Preserve original trials and perform at most the exact retry selected by the recovery policy. */
export default async function workOnEvalHandoffGoal(goal:string):Promise<EvalRecoveryResult>{
 const job=await chooseEvalJob(goal,await discoverEvalJobs());
 if(!job)return {status:"unresolved",reason:"job-unavailable"};
 const trials:EvalTrial[]=[];
 for(const runId of await chooseEvalAttempts(goal,job)){
  const observation=await openEvalAttempt(job.id,runId);
  if(observation)trials.push({observation,review:await reviewEvalRecovery(observation.request)});
 }
 let decision=await decideEvalHandoff(goal,trials,false);
 if(decision.action==="retry"){
  const observation=await retryOpenEval(job.id,decision.runId);
  if(observation)trials.push({observation,review:await reviewEvalRecovery(observation.request)});
  decision=await decideEvalHandoff(goal,trials,true);
  if(decision.action==="retry")throw new Error("The recovery policy requested a second retry after its allowance was spent");
 }
 const confirmed=confirmedEvalResult(decision,trials);
 const retain=confirmed?await shouldStageEvalResult(goal,confirmed):false;
 const artifact=retain&&confirmed?await stageEvalHandoff(confirmed.observation.jobId,confirmed.observation.attempt.runId):null;
 return applicationResult(job.id,trials,decision,artifact);
}
