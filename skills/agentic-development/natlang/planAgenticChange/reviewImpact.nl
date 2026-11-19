---
description: Establish source ownership and review persisted compatibility before planning a canary.
args:
  goal: string
  sources: AgenticSourceObservation
returns: AgenticImpact
---
Call findOwners with goal and sources. Call reviewHistory with goal and the returned units. Return ownership, blockers, and the history assessment together. Retain the exact unit paths. List only consumers implicated by the requested change.
