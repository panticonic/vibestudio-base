---
description: Recommend a real next step and write a note only when the goal and grant both permit it.
args:
  goal: string
  card: SystemCandidateCard
  preview: SystemCandidatePreview
returns: SystemCandidatePlan
---
Call classifySystemConflict with preview. Set record true only when the user requests a private artifact and card.mayRecord is true. Return a short finding plus exact non-null source digests in base, ours, theirs order. Keep text limited to the reviewed evidence. Do not claim a merge was applied.
