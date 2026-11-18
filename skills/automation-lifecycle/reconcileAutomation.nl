---
description: Apply and verify the caller-authorized pause or resume of a single Vibestudio automation.
args:
  request: LifecycleRequest
returns: LifecycleReport
---
1. Call observeMission(request.missionId). Call assessTransition(request, before).
2. Only for apply, call applyTransition(request) once, then observeMission for the same ID again. Otherwise retain the first observation and a null receipt.
3. Call confirmTransition(request, decision, observation, receipt) and return its result. Use the actual observation even when the installed definition changed. A request to pause or resume is about scheduling and does not assert that an existing run finished or was cancelled.
