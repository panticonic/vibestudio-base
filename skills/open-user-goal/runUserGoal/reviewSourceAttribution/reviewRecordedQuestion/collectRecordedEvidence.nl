---
description: Recover the exact affected set and negative evidence for the selected proposal.
args:
  assignment: RecordedQuestion
  ref: string
returns: RecordedEvidence
---
Call readWorkCohort(assignment, ref). Call readRejectionRecord(assignment, ref, cohort). Return the unchanged cohort and withdrawn records. A related reason on a different proposal does not explain this one.
