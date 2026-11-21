---
description: Compile a concise handoff with preserved exact manifest, icon and lifecycle receipts.
args:
  goal: string
  plan: UnitHandoffPlan
  observation: UnitHandoffObservation
  design: UnitDesignHandoff | null
  identity: UnitIdentityReport | null
returns: UnitHandoffReport
---
Return the exact plan, observation, design and identity. Report staged only after the installed icon skill verifies its working readback. Report held for a missing, invalid or conflicting required observation, unavailable requested icon or requested draft whose authorization conditions failed. Otherwise report reviewed, including a matching existing icon and read-only design alternatives. Use reason to answer the user's request with the correct revision and next step. Protect main and preserve the evidence established by each stage.
