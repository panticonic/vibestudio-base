---
description: Choose an owner-authorized disposition for the current task.
args:
  goal: string
  task: TaskView
  review: ReviewedAttempts
returns: TaskResolution
---
Return a status only when the user requested that specific local state change and the current evidence supports it. Retry-ready needs a current failure or cancellation and accepted prerequisites. Review or done needs an exact current terminal receipt, the appropriate user authorization, and accepted prerequisites. When held, explain the exact absence, ownership mismatch, draft, blocked prerequisite, or revised task that matters.
