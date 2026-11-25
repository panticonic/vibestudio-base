---
description: Recover the requested eval result from actual journal and readback evidence, retaining a handoff only when requested.
args:
  goal: string
returns: EvalRecoveryResult
---
Resolve the relevant active job from its current purpose and scope. The journal namespace discovers jobs, opens retained attempts, performs native-authorized exact retry and stages a handoff; the reviewer hierarchy interprets actual journal/readback evidence. The sibling selection, disposition and retention judgments are available to help.

Choose and compose the evidence work needed for this goal. Keep every original observation and review when considering a newer attempt. Lifecycle, returned value, journal completeness and independently confirmed effect are different facts: a failed cell can still have a verified requested effect, while a plain return or incomplete journal cannot establish that effect. Current-result requirements cannot be satisfied by stale prior work. Use an exact retry only when the original user/native grant authorizes it and the actual observation supports it; track whether that allowance has been spent. React to its actual new observation instead of replaying an invented terminal result.

Use confirmedEvalResult to join any selected result to actual immutable run/result digests and independent readback. Retain a handoff only if the user requests it and that confirmed result meets their condition. Return applicationResult with the real job, trials, decision and optional actual handoff, or the supported unresolved job-unavailable result. Keep useful confirmed output when optional retention is not available.
