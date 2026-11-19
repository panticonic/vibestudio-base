---
description: Resolve the catalog choice and decide whether the caller asked for a change.
args:
  request: UnitIdentityRequest
  intent: IconIntent
  observed: UnitIdentityObservation
returns: UnitIdentityAssessment
---
Call unitIdentity.resolve with the operation ID and exact icon intent. If it returns null, hold. Otherwise call chooseIconAction with the resolved candidate, original observation and whether the caller requested preparation. Return the candidate and that decision.
