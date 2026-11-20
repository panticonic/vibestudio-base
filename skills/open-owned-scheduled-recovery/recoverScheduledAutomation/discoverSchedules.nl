---
description: Locate the current exact owned interval schedule and collect neighboring options.
args:
  goal: string
returns: Schedule
budget: { maxTurns: 8 }
---
1. Call listSchedules. Match the user's schedule name together with its group and owner if several records have similar names.
2. Call readSchedule for the exact intended ID. Keep the observed revision and future cadence details.
