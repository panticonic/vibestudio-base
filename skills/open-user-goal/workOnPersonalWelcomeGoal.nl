---
description: Reconcile an owned Personal welcome, setup, tour or Explorer next step.
budget: { maxTurns: 32 }
args:
  goal: string
returns: WelcomeResult
---
1. Discover the current Personal resources. Choose the intended resource. Read the exact retained channel twice, keeping both native frontiers. Resolve the chosen resource if there is one.
2. Call reconcileWelcomeEvidence with the exact index, choice, both views and actual resolution.
3. For setup or chooser call reviewWelcomeSetup with goal and the assigned intent. For a valid verified-current tour record call reviewWelcomeTour with its exact native row, canonical scene and deck count. For retry-ready call retryWelcomeProbe with the authorized exact request. Leave other reviews null.
4. Call decideWelcomeNextStep with the exact evidence, current resolution and reviews. If it says stage, use workspace.stageWelcomeNextStep once. Keep the exact plan, installed review results and actual receipt.

Finally call applicationResult with plan, reviews, and handoff. Return its exact domain result; repeated review requests and native observation audit stay internal.
