---
description: Check whether the verification can be attributed to the declared plan.
args:
  plan: SuiteReviewPlan
  execution: SuiteReviewExecution
returns: SuiteReceiptStatus
---
If execution.current is false, return stale. Otherwise call matchesSuiteReceipt with plan and execution.receipt. Return matched when it succeeds and incomplete otherwise.
