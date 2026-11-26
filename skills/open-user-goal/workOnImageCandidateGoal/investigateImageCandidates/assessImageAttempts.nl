---
description: Evaluate retained selection changes and decide which owned candidates need original readback.
args:
  goal: string
  index: ImageIndex
  plan: ImagePlan
  observations: ImageJournal[]
returns: ImageAssessment
---
1. Work from the latest actual observed journal in observations, retaining earlier observations only as evidence of changes. Locate the exact brief and retain the latest selection, rights and attempt receipt for each candidate in the assigned owner. Recognize preview-only records and lookalike projects, and never derive eligibility from them.
2. Judge whether the revised prompt preserves the purpose of the requested brief. Compare the reference ID exactly, and distinguish ownership, review-only permission, permission to hand off, and revocation. A refreshed selection can invalidate a preview. A cancelled or failed retry cannot complete by reusing its old preview.
3. Check the effective output format and suffix, current provider receipt, and terminal state. An applied output save or a newer provider response each has a separate meaning. A superseded output path cannot serve as proof of that attempt's saved bytes.
4. Report exact candidate IDs and reasons. Queue only owned candidates eligible for original reads, using the latest selection for current mode, the exact requested label for historical mode, and the relevant distinct attempts for comparison mode. Preserve an eligible historical attempt for comparison when the current attempt fails.
