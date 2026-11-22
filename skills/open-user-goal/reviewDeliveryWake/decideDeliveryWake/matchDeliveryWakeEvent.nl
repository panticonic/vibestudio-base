---
description: Match the native event and at-most-one exact mailbox coordinate.
args:
  assignment: DeliveryWakeAssignment
  evidence: DeliveryWakeEvidence
returns: DeliveryMatch
---
Find one retained event with the assigned request name, event kind and recipient. A similar event for another recipient or an earlier progress record cannot match.
Match the event's id, exact recipient and subscription revision to a mailbox row. If there is more than one possible event or duplicate current mailbox entry, return both null. If the event is uniquely present but still needs wake, return its evidence and null mailbox.
