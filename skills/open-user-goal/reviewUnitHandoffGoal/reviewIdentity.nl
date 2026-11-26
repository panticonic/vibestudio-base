---
description: Use the installed workspace icon skill to review artwork and stage only a permitted draft.
args:
  goal: string
  plan: UnitHandoffPlan
  observation: UnitHandoffObservation
  design: UnitDesignHandoff | null
returns: UnitIdentityReport
---
1. Call authorizeDraft with the plan, observation, and design. It checks the user's conditions against current manifest evidence and the exact workspace grant.
2. Use observation.identityRequest with the original goal and prepare set to that result. Keep its operationId and actual unit description unchanged. The installed skill interprets the goal separately from the unit's purpose, preserves an explicit requested term and family, and checks the installed catalog without substituting a different symbol.
3. Call installed.prepareUnitIdentity with that request. Preserve its exact current observation, catalog result and readback. A held, design-only or already matching result has no effect.
