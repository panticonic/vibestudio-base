---
description: Reconcile the opening and current state before attempting an authorized patch.
args:
  goal: string
  plan: LaunchPlan
  opening: LaunchSnapshot
  current: LaunchSnapshot
returns: LaunchDecision
---
Do not attempt a read-only task. Hold when the panel, owner, entry, entity or build changed. Compare the exact fields touched by the patch against the two observations. For an explicitly conditional goal, hold if a touched field moved in the meantime, even if it moved to the proposed value. When the owner changed an unrelated sibling and the goal authorizes preserving it, apply only the requested fields to the current basis. An explicitly authorized validation probe submits the exact requested test values without substituting a valid fallback. Explain the exact authority and scope.
