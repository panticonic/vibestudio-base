---
description: Review a live, caller-assigned automation and validate the resulting plan against current mission state.
uses: [prepareAutomation]
args:
  request: AutomationPlanningRequest
returns: AutomationPlanningReview
---
1. Call observePlanningState with request.operationId. Retain the resulting snapshot as before.
2. Call projectPlanningRequest with request and before. Call prepareAutomation with that input.
3. If the plan is a hold or a launch, return held with the actual plan, before and after null.
4. Otherwise call observePlanningState again with the same operationId. Call checkHandoff with the actual plan and both observations. Return its status with the unmodified plan, before and after.
