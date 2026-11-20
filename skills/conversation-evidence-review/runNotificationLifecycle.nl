---
description: Present and clean up one temporary notification assigned by the caller.
args:
  request: NotificationLifecycleRequest
returns: NotificationLifecycleReport
---
1. Call showAssignedNotification with request.operationId.
2. Call dismissAssignedNotification with request.operationId and the exact notification ID returned by the host.
3. Return the result of confirmNotificationLifecycle from both receipts.
