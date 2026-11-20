---
description: Identify which owned lane has evidence the user requests.
args:
  goal: string
returns: NotificationLane
budget: { maxTurns: 8 }
---
Call notificationState.discover. Choose the actual lane matching the user’s named desk or mailbox. Treat similar subjects or notification IDs on a neighboring desk as separate evidence.
