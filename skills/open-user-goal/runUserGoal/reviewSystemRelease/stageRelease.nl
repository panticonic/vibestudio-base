---
description: Write a canonical private handoff from the exact retained case evidence.
args:
  assignment: ReleaseAssignment
  choice: RunChoice
  cases: "CaseEvidence[]"
  assessment: ReleaseAssessment
returns: "ReleaseReceipt | null"
---
Return systemReleaseHandoff.stage(assignment.id, choice.runId, assessment.disposition, cases).
