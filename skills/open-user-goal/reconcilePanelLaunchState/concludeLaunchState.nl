---
description: Verify the exact resulting launch state independently and explain the scoped result.
args:
  goal: string
  index: LaunchIndex
  companionsBefore: LaunchSnapshot[]
  companionsAfter: LaunchSnapshot[]
  plan: LaunchPlan
  opening: LaunchSnapshot
  current: LaunchSnapshot
  decision: LaunchDecision
  effect: LaunchEffect | null
  readback: LaunchSnapshot
returns: LaunchVerdict
---
A read-only plan confirms the independently persisted launch state. A planned conditional change without an authorized attempt is held. A rejected or stale effect requires unchanged current state and cannot be described as a saved value. For an accepted effect, confirm the exact resulting native state from readback, including requested sibling fields within that same active state, and only then report applied. A separate companion record needs its own actual observations: compare companionsBefore and companionsAfter by exact indexed identity when the user asks whether it remained untouched. Never claim that a companion was checked from its title or from the selected slot alone. If a requested conclusion lacks evidence, say what is missing rather than asserting protection. Include what changed or what blocked the requested operation. Persisted launch state proves what is saved; it does not establish rendered panel behavior.
