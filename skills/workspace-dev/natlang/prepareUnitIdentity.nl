---
description: Design a workspace unit icon and optionally prepare its exact manifest and artwork changes.
args:
  request: UnitIdentityRequest
returns: UnitIdentityReport
---
1. Observe the assigned unit with unitIdentity.observe. Interpret the actual request.goal and unchanged request.unit with chooseRequestedIcon. The user's requested symbol is part of the request, not an alteration to the unit's description.
2. Call assessIcon with the request, intent and exact observation.
3. When the assessment says prepare and supplies a candidate, call unitIdentity.stage with request.operationId, the observed revision and the candidate choice ID. Call verifyUnitIdentity with the observation, candidate and resulting change.
4. Otherwise return the assessment's outcome unchanged and no change. Preserve the original observation, intent and assessment in every result.
