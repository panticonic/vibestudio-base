---
description: Decide whether an inferred constraint or proposed action survives visible causes, related work and rejections.
args:
  request: ConstraintQuestion
returns: ProvenanceReport
---
If the source returns too-broad, return narrow-scope with no evidence. Otherwise call compareProperty with the proposed property and the disclosed evidence. Call judgeConstraint with that vote and the visibility boundary. Return its exact status and evidence. Restricted or pruned observations cannot establish missing history.
