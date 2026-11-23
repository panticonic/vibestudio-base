---
description: Compare the actual current owner lane using installed News cadence policy.
args:
  goal: string
  index: NewsEvidenceIndex
  current: NewsEvidenceSnapshot
returns: ScheduleWitness
---
Use the latest cadence record with the assigned goal and index.scope.cadenceIntent. Call installed.reviewers.reviewSchedule with kind schedule and the exact owner, poll and briefing. Keep the request and its unchanged result.
