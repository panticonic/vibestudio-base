---
description: Interpret an identity-checked verification receipt and identify the next useful check.
args:
  execution: SuiteReviewExecution
returns: SuiteReviewResultDecision
---
Call interpretOutcome with execution and then planFollowUp with that outcome and the same execution. Return both results.
