---
description: Retain a scoped local note bound to the source state observed during the review.
args:
  assignment: SourceAttributionAssignment
  files: SourceAttributionFile[]
  evidence: SourceAttributionEvidence[]
  conclusion: SourceAttributionConclusion
returns: SourceAttributionReceipt | null
---
If assignment.mayRetain is false or the user did not request a local note, return null. An accurate unresolved conclusion can be useful requested evidence; do not invent rooted claims just to qualify for persistence. All cited fragments and observed files must belong to one current state. If there is no observed current state, or those states disagree, return null. Otherwise call writeOwnedReceipt(assignment, files[0].state, conclusion) and return its exact status, including a genuine authority-closed or stale refusal. Do not report permission as successful persistence.
