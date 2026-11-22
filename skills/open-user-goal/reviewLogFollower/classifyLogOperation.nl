---
description: Select the actual authorized request's result and determine whether local evidence can be kept.
args:
  assignment: FollowAssignment
  joined: FollowJoin
returns: FollowDecision
---
When joined continuity is held return unobserved, no citations and stage false.
Otherwise call findCurrentLogEffect(assignment, joined.rows). Return the exact state and citations. Stage only when mayStage and that state is committed.
