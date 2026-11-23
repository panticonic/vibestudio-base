---
description: Bind the local evidence note to current owned state and re-read its exact stored bytes.
args:
  assignment: SourceAttributionAssignment
  state: string
  conclusion: SourceAttributionConclusion
returns: SourceAttributionReceipt
---
Return sourceOriginReceipt.retain(assignment.id, state, conclusion).
An identical assignment/state/conclusion request may retrieve the original native receipt after an interrupted response without retaining another file. Different requests or stale authority/retained bytes are rejected.
