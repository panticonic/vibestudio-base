---
description: Stage one private scratch artifact against the currently confirmed Grimoire frontier.
args:
  id: string
  frontier: string
  plan: GrimoirePlan
returns: GrimoireSceneReceipt | null
---
Return grimoireHandoff.stage(id, frontier, plan).
