---
description: Apply the authored patch to its exact scoped working revision.
args:
  id: string
  revision: string
  changes: SkillMaintenanceChange[]
returns: SkillMaintenanceReceipt
---
Return skillMaintenanceEdit.stage(id, revision, changes).
