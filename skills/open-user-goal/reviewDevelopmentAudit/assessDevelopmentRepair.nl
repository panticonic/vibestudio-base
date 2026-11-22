---
description: Review owned retained development evidence.
args:
  assignment: "DevelopmentAssignment"
  observed: "DevelopmentPair"
  choice: "DevelopmentChoice"
returns: "DevelopmentAssessment"
---
When choice has a blocker, report it with an empty decisiveSequences.
Otherwise select the observation with choice.runId and call assessRetainedCheckpoint(assignment, run). Return the assessment exactly.
