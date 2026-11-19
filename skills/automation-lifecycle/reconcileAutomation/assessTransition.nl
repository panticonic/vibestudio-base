---
description: Decide whether the requested transition can apply to this observed definition.
args:
  request: LifecycleRequest
  observation: MissionObservation | null
returns: LifecycleDecision
---
Return held if the observation is absent, belongs to a different ID or revision, or is terminal (completed or retired). A pause wants paused and a resume wants active. With that exact state already observed return unchanged. Otherwise return apply for an active mission being paused or a paused mission being resumed.
