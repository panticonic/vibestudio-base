---
description: Decide whether the current Calendar event and owner instructions support a specific local runbook edit.
args:
  goal: string
  local: RunbookBasis
  calendar: CalendarReport
returns: RunbookDecision
---
Read the latest approved instruction and compare the event identity, version, time window, and which exact runbook section the goal asks to change. Return revise only for an explicitly authorized working draft and matching approved evidence. Return review-only when the user asks only to inspect. Return held when the selected event is missing, stale or cancelled, the authority was withdrawn, or the user and approved instructions disagree. Keep the exact path and approval reference when established.
