---
description: Review retained desktop client readiness without disturbing authorized window state.
args:
  goal: string
returns: DesktopReadinessOutcome
budget: { maxTurns: 18 }
---
1. Call locateDesktopDesk with the unchanged user goal.
2. Call clientDevelopment.reviewClientAdmission with {goal, operationId: desk.operationId} to review the exact installed System client.
3. Call inspectDesktopWindow and inspectDesktopUpdates for the exact desk. Preserve the observations verbatim with the desk and complete installed admission report as evidence.
4. Call decideDesktopReadiness with the goal and evidence. Return the actual readiness decision. This review cannot execute a build, apply an update, roll back a build, restart a window, or persist a user document.
