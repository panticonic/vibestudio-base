import confirmedEvalResult from "./confirmedEvalResult.js";
import type {EvalTrial,EvalRecoveryDecision,EvalHandoffArtifact,EvalRecoveryResult} from "./types.js";
export default function applicationResult(jobId:string,trials:EvalTrial[],decision:EvalRecoveryDecision,artifact:EvalHandoffArtifact|null):EvalRecoveryResult {
 const confirmed=confirmedEvalResult(decision,trials);
 return {status:"reviewed",jobId,reviews:trials.map(trial=>trial.review),decision,result:confirmed?{jobId:confirmed.observation.jobId,runId:confirmed.observation.attempt.runId,runDigest:confirmed.observation.runDigest,resultDigest:confirmed.observation.resultDigest!,readback:confirmed.review.readback}:null,artifact};
}
