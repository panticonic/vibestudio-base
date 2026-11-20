---
description: Reconcile the user's local project and retain authorized evidence in the installed scratch skill.
args:
  goal: string
returns: LocalReconciliationGoalReport
budget: { maxTurns: 14 }
---
1. Call project.reconcileLocalGoal with the unchanged goal. Keep the actual integration result and any released evidence request.
2. When an evidence request is present, call scratch.assembleHandoff with it unchanged. Use status staged and the actual receipt only if the scratch skill reports staged. Otherwise use held and a null receipt. If no evidence request was released, use held for a requested handoff and none if no handoff was requested.
3. Call project.reconcileLocalGoal.discoverWindow.readWindow to obtain the final actual window. Return integration, window, and handoff with their observed values. A later window closure can hold a handoff after successful integration.
