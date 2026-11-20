---
description: Select a target and the evidence checks necessary for this publishing request.
args:
  goal: string
  observed: PublicationGoalObservation
returns: 'PublicationGoalChoice | null'
---
1. Match the user's request to the observed provider, destination and environment. Use the exact target ID if the evidence identifies one destination unambiguously.
2. Select prepare for readiness or a review of the local package and its presentation. Select check-existing to recover or confirm the progress of an already requested operation. Leave preflight null when only assessing the prior review.
3. Set compareRevision if the goal depends on whether a retained review carries forward to a package or target. Select the requested preflight as well when readiness or progress matters separately. Return null if the request cannot be supported by the observed targets or asks for an effect that these inspection surfaces do not authorize.
