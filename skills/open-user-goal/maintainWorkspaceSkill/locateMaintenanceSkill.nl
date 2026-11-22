---
description: Find the named reusable skill's exact working edition.
args:
  goal: string
returns: SkillMaintenanceCard
---
Call skillMaintenanceEvidence.discover. Match the named skill in the goal, preferring its current working edition. Preserve its exact opaque identity. The archive can share callable names but is neither the current source nor writable.
