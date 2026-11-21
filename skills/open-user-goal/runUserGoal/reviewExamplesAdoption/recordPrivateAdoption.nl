---
description: Record one private adoption handoff bound to the exact confirmed review state.
args:
  id: string
  event: string
  plan: AdoptionPlan
returns: AdoptionReceipt | null
---
Return adoptionHandoff.record(id, event, plan).
