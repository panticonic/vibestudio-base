---
description: Translate an underspecified local request into the minimum installed capabilities and verify exact native evidence.
budget: { maxTurns: 36 }
args:
  goal: string
returns: IntentReport
---
1. Call workspace.readIntentNotice. Call searchRelevantIntent with the unchanged goal and notice. It chooses relevant installed capability IDs. Join selection.methodIds to exact current native contracts with workspace.describeIntentSelection; these returned capabilities are native values, not rewritten catalog prose.
2. Call chooseIntentActions with the goal, notice and actual capabilities. Call workspace.inspectIntentEvidence only for each exact selected method and owned scope, in plan order. Keep those native observations for the conclusion.
3. Call concludeIntentReview with the original goal, plan and exact native evidence. If the user explicitly requests a private result note, pass only that outcome to workspace.stageIntentNote. Return the conclusion and the actual note receipt, or null when no note was requested.
