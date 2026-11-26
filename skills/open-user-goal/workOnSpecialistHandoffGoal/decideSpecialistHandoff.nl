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
Decide which action and explanation the actual user goal and observed specialist evidence justify. A progress report, similar handle, foreign assignment, wrong provider or uncommitted source is not usable original completion. A verified join still needs original artifact readback before presenting the work as usable. Preserve uncertainty and the actual reason for any hold. Stage only a requested local integration when current scope permits it and the required original/history evidence is available; permission alone does not require staging. Use bindSpecialistPlan to join that semantic intent to the exact observed IDs, frontier and original bytes rather than copying witnesses by hand. Return its bound plan unchanged.
