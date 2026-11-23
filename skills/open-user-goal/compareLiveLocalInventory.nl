---
description: Choose a safe local model handoff or explain the exact current blocker across candidate models.
budget: { maxTurns: 14 }
args:
  goal: string
returns: LocalInventoryOutcome
---
1. Call findLocalInventoryDocket with the exact goal. If there is no unique current match, return null report and explain what is missing.
2. Call planLocalInventoryComparison with the goal and exact docket. For a supported plan call installed.prepareLocalModel with that plan.
3. Return the actual comparison report. Explain which model, if any, can meet the conditions and whether it needs a fresh or continued conversation. Preserve absent, unready and incompatible rows as distinct evidence. Only plan this handoff.

Return the actual comparison report or null and the concrete recommendation or missing-evidence reason. The docket and planning request stay in working calls.
