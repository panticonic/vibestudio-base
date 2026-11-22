---
description: Discover the exact retained account state and obtain a fresh authorized projection.
args:
  lane: NotificationLane
returns: NotificationLifecycle
budget: { maxTurns: 12 }
---
1. Call notificationState.read(lane) to capture the original owned projection.
2. Call notificationState.refresh(lane) exactly once. Preserve its actual authority, producer receipt and observation disposition.
3. If the returned lane still has the same exact ID and is non-null, read that returned current lane using notificationState.read. When the old scope is retired or replaced with another scope, current is null. Return the original, refresh and current results exactly.
