---
description: Recover a retained provider approval and original conversation result for an authorized handoff.
budget: { maxTurns: 30 }
args:
  goal: string
returns: ProviderGoalReport
---
1. Call workspace.discoverRetainedConversations. Select the intended conversation with chooseProviderConversation. Inspect its exact retained state with workspace.readProviderConversation. Re-read it once for its current frontier. Keep both actual views.
2. Call reviewRetainedApproval with the goal, selected card, and both views. It compares the caller-visible queue observations through the installed approval review. Call chooseRetainedResult with the goal, card, latest view and approval assessment. Read exact cached output using workspace.readProviderOutput only if that selection requests it.
3. Call reviewRetainedDelivery with the actual card, current view, selection and returned cached output. Call decideProviderHandoff with the goal and all exact receipts. If the resulting plan is ready and the user requested an explicitly permitted local handoff, call workspace.stageProviderHandoff once. Otherwise retain no artifact. Return the actual plan and receipt or null.
