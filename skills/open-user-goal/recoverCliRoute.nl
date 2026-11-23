---
description: Recover the authorized target and continuation of a retained workspace CLI invocation.
budget: { maxTurns: 12 }
args:
  goal: string
returns: CliRouteOutcome
---
1. Call selectCliDocket(goal). If no current docket can be uniquely identified, return held with null gateway and continuation and explain what is missing.
2. Call remote.reviewRemoteRoute with the selected exact request. Preserve the authenticated observation. If the verdict differs from verified, return held with this gateway review and null continuation. Explain the outstanding identity issue.
3. Call remote.planCliContinuation with that same request only after a verified gateway. The selected context source, status and allowed next action all come from that result. Return reviewed with the full actual continuation and a concise reason, even when the disposition is to repair scope or ask the parent. The task only asks for a review of the invocation.

Return status, the actual gateway review and continuation or null, and the concrete reason. The selected docket remains working scope.
