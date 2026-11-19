---
description: Interpret an identity-checked verification receipt and identify the next useful check.
args:
  plan: SuiteReviewPlan
  execution: SuiteReviewExecution
returns: SuiteReviewResultDecision
---
1. Call checkReceipt with the plan and execution. For matched, call interpretOutcome with execution. For stale or incomplete use that outcome directly.
2. Call planFollowUp with the outcome and the same execution. Return the outcome and follow-up.
