---
description: Interpret receiver continuity and decide whether the requested recovery is established.
args:
  goal: string
  assignment: DeliveryWakeAssignment
  evidence: DeliveryWakeEvidence
  match: DeliveryMatch
returns: DeliveryWakePlan
---
Answer the continuity question from the actual evidence. Readiness, an active attached original receiver, its exact revision, the saved cursor, a complete original range and unique addressed event are distinct facts. A similar label, stale checkpoint, peer's completion or progress record cannot replace the original outcome. A failed original terminal is still a real outcome and must not be described as a successful operation.
Consider what the user asked: a query or confirmation may require no recovery; permission alone does not request one. Plan recovery only for the requested still-missing original outcome when its current native scope is established. Already retained mailbox state is a confirmation, not a request to deliver again. Report limitations accurately and preserve the existing context/cursor when a condition is unmet.
Return recover as that decision and finding as a grounded explanation of the current evidence. Do not claim that a merely planned recovery already occurred; the caller owns any native recovery and its acknowledgment.
