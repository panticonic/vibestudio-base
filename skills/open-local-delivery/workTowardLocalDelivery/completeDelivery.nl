---
description: Compose, submit and recover one exact authorized local note.
args:
  goal: string
  observations: LocalObservation[]
  target: LocalObservation
returns: LocalDeliveryResult
---
1. Call composeNote with the goal, the observations and the exact target. Ask commitNote to submit that content with target.basis. Keep the returned attempt id even when its response is interrupted.
2. Call readAttempt for that attempt. Return the original attempt and readback. Do not submit again when an acknowledgement is late or the initial response was interrupted.
