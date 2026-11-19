---
description: Explain the declared suite route and choose the next operation.
args:
  plan: SuiteReviewPlan
  mode: SuiteReviewMode
returns: SuiteReviewPlanDecision
---
Call interpretRuntime with the plan. Give the returned route and mode to chooseRunDisposition. Return the route and next action.
