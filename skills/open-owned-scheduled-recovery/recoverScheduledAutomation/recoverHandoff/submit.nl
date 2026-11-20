---
description: Submit one local handoff for the exact observed schedule and authorization.
args:
  schedule: Schedule
  authorization: Receipt
  lane: Lane
returns: Submission
---
Call services.scheduledHandoff.submit(schedule, authorization, lane) and return its result unchanged.
