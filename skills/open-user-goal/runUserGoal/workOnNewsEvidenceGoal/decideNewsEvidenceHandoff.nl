---
description: Decide a local editorial outcome from current reader, archive and source evidence.
args:
  goal: string
  index: NewsEvidenceIndex
  choice: NewsEvidenceChoice
  current: NewsEvidenceSnapshot
  boundary: ReaderBoundary
  readers: ReaderWitness[]
  schedule: ScheduleWitness
  briefing: BriefingWitness | null
returns: NewsEvidencePlan
---
Keep actual channel, topic, frontier and current reader message. A failed reader boundary holds with its exact reason. For an admitted reader with no edition, hold with edition-unobserved. Otherwise use the first exact briefing finding code. Attention, waiting, or blocked briefing reviews hold. A ready briefing is report unless the user authorized a private note and the finding is grounded-development or material-follow-up; then stage. Preserve every reviewed cadence lane and explain any disagreement or pause separately from article and archive state. Use the original bytes and exact source identity. Never fetch, publish, change the schedule, or retarget the protected reader.
