---
description: Select exactly one installed unit using the user's goal and the visible inventory.
args:
  goal: string
  units: UnitHandoffUnit[]
returns: UnitHandoffPlan
---
1. Resolve the intended path from name, kind and description. Use the exact visible path. If the user's unit is absent or two paths genuinely fit, return held with null path and a short explanation.
2. Decide whether the request concerns manifest or lifecycle, icon identity, or both together. Mark inspectLifecycle only when the goal asks for current live or retained-build evidence.
3. Set stageIcon only when the latest user instruction requests a working-only change. Questions about alternatives, proposals, existing artwork, or protected-main state call for review. Incorporate any “only if” condition into the plan: mark requireProtectedSource when an edit is authorized only if reviewed working and protected-main manifests match.
