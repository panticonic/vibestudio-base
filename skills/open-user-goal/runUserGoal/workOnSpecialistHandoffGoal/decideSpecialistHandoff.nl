---
description: Determine what the verified original specialist evidence supports in the owned workspace.
args:
  goal: string
  index: SpecialistIndex
  choice: SpecialistChoice
  current: SpecialistSnapshot
  joined: ReceiptJoin
  original: OriginalArtifact | null
  history: HistoryReview | null
returns: SpecialistPlan
---
Keep the exact selected handle, current channel, task and frontier. Copy the original receipt IDs. A reason other than verified gives hold and no artifact or source event. If the verified join has no exact original artifact or history review, hold with readback-unavailable. If verification succeeds, preserve the exact original artifact and its source event from the matching result. Stage only when the user authorized this exact local integration brief through scope.mayStage; otherwise report read-only. Briefly explain the actual boundary, including checks needed on retained history where applicable. No attach, detach, send, merge or change to the parent source is in scope.
