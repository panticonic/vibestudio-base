---
description: Coordinate a real owned-worker incident handoff or a durable release-gate continuation and clean up owned resources.
args:
 request: OperationsRequest
returns: OperationsReport
---
1. If request.kind is incident-handoff, call incident(request.goal, request.signals). If it is release-continuation, call release(request.goal, request.before, request.after). Keep that stage's actual handles and handoff.
2. Call ownedOperations.close() after the stage returns. This retires only the resources issued to this invocation and returns fresh cleanup observations.
3. Return Report with request.kind, the stage's handoff and handles, and the exact cleanup result. Never report a hypothetical worker response as an observation. If a capability fails, propagate the original failure; the caller's finally still owns cleanup.

