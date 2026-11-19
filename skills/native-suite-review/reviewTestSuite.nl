---
description: Review one manifest-declared VibeStudio test suite and interpret verification when the caller assigns execution.
args:
  request: SuiteReviewRequest
returns: SuiteReviewReport
---
1. Resolve the plan by calling testSuitePlanRead.resolve with request.operationId. Preserve it exactly.
2. Call reviewPlan with the plan and request.mode.
3. In inspect mode return the plan and decision with null execution and result. In verify mode, call testSuiteVerificationRun.run with request.operationId and plan.stateHash when the decision says run-assignment. Preserve the execution exactly and call reviewResult with it.
4. Return the plan, decision, execution and result.
