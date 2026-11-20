---
description: Decide whether an authorized local handoff is part of the user's outcome.
args:
  goal: string
  allowed: boolean
  plan: CapabilityPlan
returns: boolean
---
Stage only a ready plan when the user asked for a scratch handoff and allowed is true. A held, read-only, or unapproved plan makes no write.
