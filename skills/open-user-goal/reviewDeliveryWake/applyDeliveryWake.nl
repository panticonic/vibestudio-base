---
description: Advance only the selected complete safe native range and retain the actual bounded proof.
args:
  assignment: DeliveryWakeAssignment
  evidence: DeliveryWakeEvidence
  choice: DeliveryWakeChoice
returns: DeliveryWakeReceipt
---
Return deliveryWakeAction.apply(assignment.id, choice.event.id, evidence.pending).
