---
description: Translate an underspecified local request into the minimum installed capabilities and verify exact native evidence.
budget: { maxTurns: 36 }
args:
  goal: string
returns: IntentReport
---
1. Call workspace.readIntentNotice. Call searchRelevantIntent with the unchanged goal and notice. It chooses relevant installed capability IDs. Join selection.methodIds to exact current native contracts with workspace.describeIntentSelection; these returned capabilities are native values, not rewritten catalog prose.
2. Call chooseIntentActions with the goal, notice and actual capabilities. Call workspace.inspectIntentEvidence only for each exact selected method and owned scope, in plan order. Return the actual observations.
3. Call concludeIntentReview with the original goal, plan and exact native evidence. If the user explicitly requests a private result note, call workspace.stageIntentNote and include only the actual receipt. Return notice, the semantic selection, exact native capabilities, plan, actual evidence, outcome and actual handoff receipt. Raw search responses already remain in the execution trace; do not reproduce them in the application value.
