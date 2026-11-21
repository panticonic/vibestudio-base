---
description: Observe whether local edit authority still binds the inspected revision.
args:
  card: SkillMaintenanceCard
  revision: string
returns: SkillMaintenanceGate
---
Return skillMaintenanceEvidence.confirm(card.id, revision).
