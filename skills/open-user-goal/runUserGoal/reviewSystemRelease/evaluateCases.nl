---
description: Review the precise owned case evidence and determine what can be handed off.
args:
  assignment: ReleaseAssignment
  choice: RunChoice
returns: EvaluatedReleaseCases
budget: { maxTurns: 22 }
---
For each required case in assignment order, call readCase with the exact assignment, choice and case name. Call classifyRelease with the assignment and actual cases. Return the exact cases and its actual assessment.
