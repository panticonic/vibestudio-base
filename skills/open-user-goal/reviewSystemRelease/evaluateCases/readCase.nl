---
description: Read exact bounded facts from the selected retained case pages.
args:
  assignment: ReleaseAssignment
  choice: RunChoice
  name: string
returns: CaseEvidence
---
Return systemReleaseEvidence.inspectCase(assignment.id, choice.runId, name).
