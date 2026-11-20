---
description: Assess acceptance and cleanup receipts for the same temporary notification.
args:
  accepted: NotificationAcceptance
  dismissed: NotificationDismissal
returns: NotificationLifecycleReport
---
Use accepted.notificationId and accepted.actionLabels. If dismissed.notificationId equals accepted.notificationId, set status to cleaned-up, otherwise set it to unverified. Set interaction to unobserved.
