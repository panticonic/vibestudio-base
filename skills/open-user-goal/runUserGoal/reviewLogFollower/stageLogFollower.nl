---
description: Retain the authorized exact current observation in local scratch.
args:
  assignment: FollowAssignment
  joined: FollowJoin
  decision: FollowDecision
returns: FollowReceipt
---
Return logFollowerHandoff.stage(assignment.id, joined, decision).
