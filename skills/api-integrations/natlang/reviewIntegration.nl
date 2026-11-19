---
description: Review credential coverage for the caller's assigned API destinations.
args:
  request: IntegrationRequest
returns: IntegrationReport
budget: { maxTurns: 24 }
---
1. Call readIntegrationPlan with request.operationId. Inspect its destinations in their assigned order.
2. For each destination call reviewAudience with the plan receipt and destination ID. Preserve its result. Continue after a canonical miss or an observed lifecycle issue. Stop the remaining lookups if a result is unverified and record the unattempted IDs as held.
3. Call summarizeCoverage with the goal, assigned destinations and reviews. Return its status and guidance, the exact plan receipt, reviews and held IDs.
