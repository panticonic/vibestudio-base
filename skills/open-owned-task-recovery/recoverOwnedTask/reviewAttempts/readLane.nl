---
description: Inspect a native conversation and any retained addressed attempt.
args:
  lane: string
  recipient: string | null
returns: LaneObservation
---
Call services.ownedTaskAttempts.inspect with the exact lane and either its requested recipient handle or null. Return the actual observation.
