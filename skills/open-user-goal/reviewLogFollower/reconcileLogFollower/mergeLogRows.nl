---
description: Merge exact sequence overlap and keep distinct repeats from the current joined log segment.
args:
  assignment: FollowAssignment
  capture: FollowCapture
returns: FollowJoin
---
1. Select continued and assignment.saved.seq when the boot matches, or fresh and capture.start for an authorized restart.
2. Treat each sequence above that start through witnessedThrough as a distinct row. Join the two input arrays on sequence, sorting ascending. Full identical rows at the same sequence are one row; include their sequence once in duplicates, in ascending order. Identical text at different sequences remains distinct.
3. Conflicting payloads at one sequence give hold-conflict with null through and empty rows and duplicates.
4. Return continuity, current boot, witnessedThrough as through, merged rows, and duplicates.
