---
description: Interpret cursor and epoch continuity, completeness, and authoritative exit.
args:
  assignment: PtyAssignment
  attempt: PtyCheck
  observed: PtyObservation
returns: PtyDecision
---
Keep observed.replayDigest and observed.exit.code (or null) in the decision.
Choose the first matching disposition:
1. A reset is hold-reset. A gap is hold-gap.
2. Inconsistent framed bytes, a different replay digest, or a different start cursor is hold-proof.
3. A process still alive or missing exit is hold-running when a return code is required. When the assignment requires only interim observation, report-good with no receipt.
4. A signal is report-signal. A nonzero or missing code is report-failed.
5. A zero exit with exact evidence is stage-good only if mayStage is true. Otherwise use report-good.
