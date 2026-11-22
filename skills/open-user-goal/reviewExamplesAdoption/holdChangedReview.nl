---
description: Hold a decision based on a review superseded while the agent was inspecting it.
args:
  plan: AdoptionPlan
  gate: AdoptionGate
returns: AdoptionPlan
---
When gate.status is changed, return hold-stale and give gate.event as the single exact proof. Explain that the observed candidate is no longer the current review. Otherwise retain the prior plan.
