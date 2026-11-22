---
description: Choose the user-authorized action after a retained contract check.
args:
  goal: string
  observation: SkillMaintenanceObservation
  gate: SkillMaintenanceGate
returns: SkillMaintenanceDecision
budget: { maxTurns: 10 }
---
1. If edit authority is denied or the user only authorized inspection, choose hold-authorization. If the frontier moved, choose hold-stale and preserve the new head.
2. Compare the real witness path and revision with the observed owning skill. If either differs, choose hold-evidence and describe the missing current evidence.
3. If the exact typed contract already passed, choose keep-current. Otherwise choose stage-local-patch when the user authorized it and the regression can be addressed inside the declared editable paths.
4. Give a concise reason grounded in the actual nested source paths, typed regression, admission or revision evidence.
