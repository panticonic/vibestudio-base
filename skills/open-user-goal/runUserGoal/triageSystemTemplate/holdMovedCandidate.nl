---
description: Hold a candidate superseded by a change while assembling its evidence.
args:
  plan: SystemCandidatePlan
  gate: SystemCandidateGate
returns: SystemCandidatePlan
---
If gate.current is false, return hold-stale with record false and the exact new event as single proof. Explain the newer review needs inspection. Otherwise return plan.
