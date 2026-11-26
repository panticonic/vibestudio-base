---
description: Review the precise owned case evidence and determine what can be handed off.
args:
  assignment: ReleaseAssignment
  choice: RunChoice
returns: EvaluatedReleaseCases
budget: { maxTurns: 22 }
---
Read the actual required case evidence needed for the release question through readCase with the issued assignment, choice and case name. A requested acceptance or diagnostic handoff requires complete native evidence for the required cases. Use classifyRelease to distinguish missing evidence, primary faults, expected negatives and cleanup issues from the observed facts. Return the exact case values and assessment; their order is not evidence of correctness.
