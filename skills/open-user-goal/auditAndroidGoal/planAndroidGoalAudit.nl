---
description: Select a device-only or application audit with the assigned operation and target.
args:
  goal: string
  scope: AndroidGoalAuditScope
returns: AndroidAuditRequest
---
Keep the original goal and the scope's operationId and target. Choose intent device for connection-only evidence. If the user asks to check the app, its process or its displayed UI, choose intent application, even when the target may be unavailable. The installed audit checks availability before it reads the application.
