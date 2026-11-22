---
description: Resolve an owned workspace package selection against exact source, build and revision evidence, then optionally stage a local draft.
budget: { maxTurns: 30 }
args:
  goal: string
returns: AssemblyReport
---
1. Call workspace.readAssemblyInventory. Call chooseAssemblyCandidate with the exact goal and inventory. It selects one candidate or holds and chooses owned units to inspect.
2. Call workspace.readAssemblyUnits on the selected roots and dependency candidates. Call completeAssemblyScope with the goal, inventory, scope and actual sources. If it returns more package IDs, read those exact units at the same head. Call interpretDependencies with the complete observed evidence.
3. Call chooseAssemblyVerification with the goal, inventory, scope and dependencies. Call workspace.verifyAssemblyBuild for each actual choice and keep every returned receipt in order. A compile skipped or without retained output is not certified.
4. Call decideAssemblyOutcome with the actual goal, inventory, scope, dependencies and receipts. Call shouldStageAssemblyDraft with the goal, grant and plan. If true, call workspace.stageAssemblyDraft with that exact plan. Return the actual plan and actual local receipt or null.
