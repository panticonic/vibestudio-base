---
description: Choose whether to perform the exactly authorized scheduled change.
uses: [readSchedule]
args:
  goal: string
  schedule: Schedule
  review: Review
returns: Resolution
budget: { maxTurns: 8 }
---
1. Apply only the current approved change explicitly requested by the user. Preserve the schedule on inspection-only goals, a withdrawal, stale approval, a different approved value, or a missing prerequisite.
2. If the requested outcome already matches the observed schedule, report unchanged. Keep paused schedules paused during cadence or cap edits. When the record authorizes a cadence and cap together, make the combined window change in one commit.
3. Use commitChange with the exact observed schedule, proposed change and associated original authorization receipt. On a changed result, return the native observation without retrying or transferring old authority. On a held result with a known prerequisite, re-read that dependency with readSchedule so the parent can explain the live blocker.
