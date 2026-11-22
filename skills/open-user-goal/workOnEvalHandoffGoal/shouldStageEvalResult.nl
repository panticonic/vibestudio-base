---
description: Determine whether to stage the approved verified result for the next workspace shift.
args:
  goal: string
  decision: EvalRecoveryDecision
returns: boolean
---
Return true when the requested outcome includes a scratch handoff and the decision uses a confirmed result. Return false for a read-only report or hold. The workspace writer must check the current caller's own authority and exact receipt.
