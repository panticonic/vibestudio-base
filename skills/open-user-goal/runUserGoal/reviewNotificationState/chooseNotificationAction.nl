---
description: Decide whether the current exact notice may be acknowledged.
args:
  goal: string
  lifecycle: NotificationLifecycle
returns: NotificationDecision
budget: { maxTurns: 10 }
---
1. Ask findCurrentNotification to classify the notice from the user's scope and retained evidence.
2. If the scope changed with no authorized current view, the notice is ambiguous or missing, or only the prior revision the user named has been superseded, choose hold and explain the actual evidence.
3. Otherwise select acknowledge only when the user authorized marking the exact still-pending notice as read and the current record meets their conditions. Choose retain for reports, leave-pending requests, already-read records, and deliberately hidden rows.
4. Return the actual finding and your decision with a concise reason. A fresh snapshot under the same account can still show the requested record changed. A higher revision is a new operative record.
