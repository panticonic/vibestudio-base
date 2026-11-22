---
description: Bind the local evidence note to current owned state and re-read its exact stored bytes.
args:
  assignment: SourceAttributionAssignment
  state: string
  conclusion: SourceAttributionConclusion
returns: SourceAttributionReceipt
---
Return sourceOriginReceipt.retain(assignment.id, state, conclusion).
