---
description: Execute an authorized current program trial, inspect Workerd receipts and stage a verified output when requested.
budget: { maxTurns: 24 }
args:
  goal: string
returns: ProgramRunReport
---
1. Call runtime.discoverRuns. Ask chooseRunProgram to identify the intended active program. Call runtime.inspectProgram with that exact ID. If unavailable, return {status:"unresolved", reason:"program-unavailable"}.
2. Call reviewer.reviewRuntimeEvidence with the inspection's evidence unchanged. Ask chooseRunSample whether the user authorized a trial, using the program, inspection and decision. If no trial is requested or supported, return status "reviewed" with the program ID, empty receipts and signed null.
3. Call runtime.runSample with the selected program ID, exact inspected revision and sample ID. A refused call stops with {status:"unresolved", reason:"run-not-bound"}. Call runtime.readOutputReceipt with the actual returned ID. Stop with {status:"unresolved", reason:"receipt-unavailable"} if no receipt is retained. Call reviewer.reviewRuntimeEvidence with this receipt's evidence unchanged. Keep the actual receipt and review.
4. Ask decideRunContinuation whether to stop or perform one additional authorized trial. If it selects a sample, call runtime.inspectProgram again before invoking it. Use only its new exact revision, with a present callable. Then perform step 3 once more, appending the new receipt and preserving the first. A second inspection that cannot be run still needs its actual review. Keep all completed receipts in order.
5. Ask shouldSignOutput if the user requested a signed result and the final native receipt supports it. Call runtime.signVerifiedRun with the actual receipt ID only when it says yes. Return status "reviewed", the actual program ID, all observed receipts, and the actual signature receipt or null.

Return the actual output receipts and signed artifact or null with status and programId, or the specific unresolved reason. The internal assessment stays in working calls.
