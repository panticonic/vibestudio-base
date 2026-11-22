---
description: Identify the unique exact owned smoke specification for this accepted revision.
args:
  assignment: SmokeAssignment
  source: SmokeSource
returns: SmokeSelection
---
Search requires a complete bounded result. Filter plans by assignment.context, assignment.revision and assignment.subject.
If the search is truncated, empty, or has no matching plan, return null plan and hold-source.
If multiple plans match, return null plan and hold-ambiguity.
Otherwise return the exact matching plan and null blocker.
