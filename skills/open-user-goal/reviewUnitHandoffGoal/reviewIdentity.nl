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
2. Use observation.identityRequest with the original goal and prepare set to that result. Keep its operationId and unit name and kind. Add the user's actual visual intent to the unit description in ordinary language. Preserve the unit's purpose. For an explicit named symbol, include the exact requested term and family. Do not invent another symbol when the explicit one is unavailable.
3. Call installed.prepareUnitIdentity with that request. Preserve its exact current observation, catalog result and readback. A held, design-only or already matching result has no effect.
