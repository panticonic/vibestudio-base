---
description: Review one owned retained notification lifecycle and carry out an exact acknowledgment when authorized.
args:
  goal: string
returns: NotificationStateOutcome
budget: { maxTurns: 16 }
---
1. Pass the original goal to locateNotificationLane to identify the owned lane.
2. Call readNotificationLifecycle with that lane. Preserve its exact original snapshot, refresh evidence and current snapshot.
3. Pass the goal and actual lifecycle to chooseNotificationAction. It determines the exact target, status and whether the requested action is still authorized.
4. Pass the actual lifecycle and decision to finishNotificationReview. Return its actual outcome.
