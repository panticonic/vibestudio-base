---
description: Reconcile delivery history, exact recipient, approval evidence and the caller's authorized next step.
args:
  goal: string
  observations: LocalObservation[]
returns: LocalDeliveryDecision
---
1. Match the goal's note, subject, revision and audience to exact receipts. A receiver acknowledgement for a different room, message or revision cannot verify the one the user named. Compare each requested delivery independently.
2. Use verified when the requested acknowledgement is retained and matches. Use partial when only some required lanes are confirmed and completion is unproven. Use held for unresolved audience or a failed prerequisite to sending. Use unconfirmed when a read-only delivery cannot be verified from the available record.
3. Set sendRoomId only when the literal goal permits a new local send, all its evidence conditions are supported, exactly one current recipient resolves in that room, and the note remains undelivered there. Do not send missing material by inference, when the user asks only to inspect, or after the matching note was acknowledged.
4. Return a brief reason and references to the exact retained receipts used. Include retained contradictory or stale receipts that establish the difference when relevant. Never assign a message id to an absent receipt.
