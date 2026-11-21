---
description: Draft and stage only the exact local reusable skill repairs requested.
args:
  goal: string
  observation: SkillMaintenanceObservation
returns: SkillMaintenanceReceipt
---
Call draftSkillChanges using the original goal and exact observation. Pass its actual changes, observed revision and card ID to stageSkillChanges. Return its result.
