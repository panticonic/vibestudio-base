---
description: Choose one admissible follow-up for the caller's triage goal.
args:
  goal: string
  health: ChannelHealthReview
returns: string | null
---
Consider only findings with an inspector assigned in the health evidence. Prefer urgent findings, then investigate findings, taking the user's stated focus into account within each priority. Consider expected findings only when the goal explicitly asks to look at that activity. Return the selected finding's exact kind or null if no supported finding is relevant.
