---
description: Recover the user's owned native eval work and carry verified output into a scratch handoff.
budget: { maxTurns: 24 }
args:
  goal: string
returns: EvalHandoffGoalReport
---
1. Call journal.discoverEvalJobs. Call chooseEvalJob with the user's goal and actual catalog. If no job resolves, return {status:"unresolved", reason:"job-unavailable"}.
2. Call chooseEvalAttempts to select the original attempts needed for the request. For each selected ID in order, call journal.openEvalAttempt with the exact job and run IDs. For each opened attempt call reviewer.reviewEvalRecovery with its request unchanged. Keep each actual observation and its returned review as a trial.
3. Ask decideEvalHandoff to select a usable result, an authorized exact retry or a hold. If it chooses retry, call journal.retryOpenEval with the original chosen run ID. When a new observation returns, call reviewer.reviewEvalRecovery on that new request and append its trial. Ask decideEvalHandoff again with retrySpent true. If the retry did not open, hold based on the retained attempts. Never repeat the retry.
4. Join the final decision to the actual trials with confirmedEvalResult. If there is a confirmed result, pass that result and the unchanged goal to shouldStageEvalResult to decide the requested local handoff. Stage only when requested, using the exact job and run IDs carried by that confirmed observation. The writer independently checks its current authority and original receipts. With no confirmed result, preserve the hold and leave no artifact. Return status "reviewed", the actual job ID, all trials in order, the final decision and the actual artifact or null.
