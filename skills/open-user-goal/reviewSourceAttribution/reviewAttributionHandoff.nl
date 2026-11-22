---
description: Retain a scoped local note bound to the source state observed during the review.
args:
  assignment: SourceAttributionAssignment
  files: SourceAttributionFile[]
  evidence: SourceAttributionEvidence[]
  conclusion: SourceAttributionConclusion
returns: SourceAttributionReceipt | null
---
If assignment.mayRetain is false or conclusion has no rooted claims, return null. All cited fragments must be from one current observed state. If the observed states disagree, return null. Otherwise call writeOwnedReceipt(assignment, files[0].state, conclusion) and return its exact status.
