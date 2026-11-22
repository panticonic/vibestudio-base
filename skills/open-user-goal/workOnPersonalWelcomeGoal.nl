---
description: Reconcile an owned Personal welcome, setup, tour or Explorer next step.
budget: { maxTurns: 32 }
args:
  goal: string
returns: WelcomeGoalReport
---
1. Discover the current Personal resources. Choose the intended resource. Read the exact retained channel twice, keeping both native frontiers. Resolve the chosen resource if there is one.
2. Call reconcileWelcomeEvidence with the exact index, choice, both views and actual resolution.
3. For setup or chooser call reviewWelcomeSetup with goal and the assigned intent. For a valid verified-current tour record call reviewWelcomeTour with its exact native row, canonical scene and deck count. For retry-ready call retryWelcomeProbe with the authorized exact request. Leave other reviews null.
4. Call decideWelcomeNextStep with the exact evidence, current resolution and reviews. If it says stage, use workspace.stageWelcomeNextStep once. Return its exact plan, reviews containing setup, tour and probe, and the local receipt or null.
