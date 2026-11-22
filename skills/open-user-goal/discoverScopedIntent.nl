---
description: Translate an underspecified local request into the minimum installed capabilities and verify exact native evidence.
budget: { maxTurns: 36 }
args:
  goal: string
returns: IntentReport
---
1. Call workspace.readIntentNotice. Call searchRelevantIntent with the unchanged goal and notice. It searches actual installed capability documentation and checks the exact service contracts.
2. Call chooseIntentActions with the goal, notice and search results. Call workspace.inspectIntentEvidence only for each exact selected method and owned scope, in plan order. Return the actual observations.
3. Call concludeIntentReview with the original goal, plan and exact native evidence. If the user explicitly requests a private result note, call workspace.stageIntentNote and include only the actual receipt. Return all observed results.
