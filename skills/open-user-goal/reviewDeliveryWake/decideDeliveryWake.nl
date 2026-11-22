---
description: Identify an eligible receiver and cursor before assessing the exact delivery.
args:
  assignment: DeliveryWakeAssignment
  evidence: DeliveryWakeEvidence
returns: DeliveryWakeChoice
---
Return a hold with null event in the first applicable case:
1. No ready connection to assignment.channel with one admitted surface: hold-connection.
2. Current receiver is missing, inactive, detached, or has a different id: hold-recipient.
3. Receiver revision differs: hold-revision.
4. The saved cursor differs from pending.after when pending exists, or evidence.cursor when pending is null: hold-cursor.
5. The retained range is incomplete, or context copies are present: hold-evidence.
Otherwise call matchDeliveryWakeEvent(assignment, evidence).
If no event matches, hold-evidence. If one exact current mailbox entry exists, confirm as confirmed with that event. If no exact mailbox entry exists but pending contains the event's sequence, advance only with mayWake. Without permission hold-policy. In every other situation hold-evidence.
