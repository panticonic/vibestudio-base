---
description: Verify the exact resulting launch state independently and explain the scoped result.
args:
  plan: LaunchPlan
  opening: LaunchSnapshot
  current: LaunchSnapshot
  decision: LaunchDecision
  effect: LaunchEffect | null
  readback: LaunchSnapshot
returns: LaunchVerdict
---
A read-only plan confirms the independently persisted launch state. A planned conditional change without an authorized attempt is held. A rejected or stale effect requires unchanged current state and cannot be described as a saved value. For an accepted effect, confirm the exact resulting native state from readback, including protected siblings, and only then report applied. Include what changed or what blocked the requested operation. Persisted launch state proves what is saved; it does not establish rendered panel behavior.
