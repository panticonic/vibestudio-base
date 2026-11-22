---
description: Find the exact operation status after separating neighboring lanes, prior attempts and cleanup.
args:
  assignment: FollowAssignment
  rows: "FollowRow[]"
returns: FollowFinding
---
Use only rows with assignment.lane and assignment.request. Cite all exact matching sequences in order, including relevant cleanup. The latest matching state other than cleanup determines the result. If none exists, state is unobserved.
