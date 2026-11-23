---
description: Review an exact installed agent, worker or extension interface and what can carry forward locally.
args:
  goal: string
returns: DeployedInterfaceOutcome
budget: { maxTurns: 20 }
---
1. Call discoverInterface. Use selectInterface with the goal and survey to choose the actual subject matching the user's intent, with exact source and unit kind.
2. If the observation includes an architecture request, pass it unchanged to architecture.reviewArchitectureBoundary. Keep that actual result, including a boundary move or declaration mismatch.
3. Call decideReview with the survey, actual observation and architecture result. It separates the deployed evidence from installed declaration evidence and assesses the exact owner scope.
4. If the user requests an authorized local review note and the decision is reviewable or deployed-method-confirmed, call stageReview with the exact observation and decision. Return its actual result; otherwise leave handoff null. Do not invoke the reviewed methods, edit source, or change deployment or authority.
5. Return finding and actual handoff.
