---
description: Use the installed Calendar workflow to verify one retained event without making a scheduling edit.
args:
  goal: string
  local: RunbookBasis
returns: CalendarReport
---
Extract the event, calendars, and time window the user is asking to verify. Include the applicable coordinates from the local receipts. Ask installed.workOnCalendarGoal for current evidence and exact event revision with a read-only goal. Keep its actual decision and leave scheduling handoff to the outer runbook workflow.
