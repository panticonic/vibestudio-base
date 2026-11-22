---
description: Match the user’s active work to its current scoped local-model comparison docket.
args:
  goal: string
returns: 'LocalInventoryDocket | null'
---
Call localInventoryDocket.list and identify one current card matching the user's purpose. If missing or ambiguous return null. Call localInventoryDocket.read with that exact id, require the returned card to match, and return its actual candidates and purpose.
