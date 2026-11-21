---
description: Hold an old scene candidate when the actual public world moved.
args:
  plan: GrimoirePlan
  gate: GrimoireSceneGate
returns: GrimoirePlan
---
Retain existing holds. If gate reports changed and the plan otherwise staged a candidate, return hold-stale, a clear explanation that the live anchor evidence moved, empty proposedIds and null description. Do not stage using a different frontier.
