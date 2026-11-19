---
description: Decide whether the caller wants evidence from an execution or a declaration review.
args:
  mode: SuiteReviewMode
  route: SuiteReviewRuntimeDecision
returns: "report-plan" | "run-assignment"
---
Return report-plan in inspect mode. Return run-assignment in verify mode. In verify mode the declared runtime owns its normal execution and approval.
