---
description: Classify the observed verification outcome.
args:
  execution: SuiteReviewExecution
returns: SuiteReviewOutcome
---
A passed execution with a positive passed count is verified. For compilation-failed return compilation-failed. For no-tests return no-match. If a diagnostic shows that a test file or dependency could not load, return incomplete even when the runner counted the file as failed. Other completed executions with failed assertions are assertions-failed. Use incomplete for any other uncertain outcome.
