---
description: Recover native execution evidence and use it to resolve an operating handoff.
args:
  goal: string
returns: RecoveryHandoffOutcome
budget: { maxTurns: 36 }
uses: [workOnEvalHandoffGoal, workOnRecoveryHandoff]
---
1. Call workOnEvalHandoffGoal with the operating goal to resolve the original attempt and any authorized recovery. Keep the returned evidence and its actual disposition.
2. Call workOnRecoveryHandoff with the goal and that recovery. Return its application result, including the actual disposition, grounded finding and any local artifact.
