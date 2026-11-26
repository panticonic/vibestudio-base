---
description: Select the active semantic project and the local release actions requested.
args:
  goal: string
  index: BridgeIndex
returns: BridgePlan
---
Match the requested project by purpose as well as title. An archive provides historical context only. Choose the active delivery scope. Choose intent commit only for an explicit request for a local semantic commit. No external action is an available choice. Set handoff if the user requests a private decision note.

If no unambiguous matching current scope exists, return null as its ID and request no write or handoff. An unavailable selection is not a reason to invent an identifier.
