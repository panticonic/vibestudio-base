---
description: Carry out a specifically authorized held-scope acknowledgment and verify final state.
args:
  lifecycle: NotificationLifecycle
  decision: NotificationDecision
returns: NotificationStateOutcome
budget: { maxTurns: 10 }
---
1. Use the actual current lane, exact finding ID and revision for notificationState.acknowledge only if action is acknowledge and all three values exist. Use null acknowledgment otherwise.
2. If an acknowledgment was attempted, always read the same lane again to get final authoritative counts and retained rows. If there was no operation, final is the actual current snapshot.
3. Return the actual acknowledgment when an acknowledgment was attempted; otherwise return the notification decision.
