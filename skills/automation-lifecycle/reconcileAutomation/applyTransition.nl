---
description: Apply a single controller operation for the caller's assigned ID and revision.
args:
  request: LifecycleRequest
returns: LifecycleReceipt
---
Return await automationLifecycleChange.apply(request.missionId, request.revisionDigest, request.action) unchanged. Never repeat the operation after an uncertain result.
