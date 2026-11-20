---
description: Recover the actual original handoff receipt for a permitted local destination.
args:
  schedule: Schedule
  review: Review
returns: Receipt | null
budget: { maxTurns: 8 }
---
1. Use submit only when the approved local destination and exact current schedule evidence are established and the user requested that handoff.
2. Use readback for the same original attempt even when submit responded with interrupted. The actual native replay receipt settles what was recorded. Do not create a second note or substitute an older attempt.
