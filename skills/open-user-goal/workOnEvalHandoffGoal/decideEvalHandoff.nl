---
description: Decide whether to carry confirmed output, make the approved exact retry, or abstain.
args:
  goal: string
  trials: EvalTrial[]
  retrySpent: boolean
returns: EvalRecoveryDecision
---
1. A confirmed scoped effect can survive a failed cell. Treat lifecycle, completeness of the native journal, and separate readback as distinct evidence. A plain return value and an incomplete or mismatched journal do not certify the effect. Do not carry a withdrawn source or cancelled run.
2. Prefer the confirmed current or newly retried result when it addresses the request. Use a confirmed prior result only when the user allows it as fallback or asked for that exact prior output. A requirement for current output cannot be met by stale prior work.
3. If no suitable confirmed result exists, retry only the latest original run when the user authorizes that exact retry and its observation says exactRetryAuthorized. Stop after one retry. Otherwise return hold with the supported reason. Use source-withdrawn when the relevant result was withdrawn, current-result-required when only a prior result would be usable but scope requires current, and no-confirmed-effect otherwise.
