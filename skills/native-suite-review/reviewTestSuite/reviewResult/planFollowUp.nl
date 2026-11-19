---
description: Explain the observed outcome and its appropriate next step.
args:
  outcome: SuiteReviewOutcome
  execution: SuiteReviewExecution
returns: string
---
For verified, report the verified count. For assertion or compiler failures, give a source-focused next check grounded in the diagnostics. For no-match check the assigned suite and file or test-name filter. For incomplete inspect the infrastructure or approval result before retrying. For stale resolve the new declaration and repeat the assigned verification on that state. Keep the original declared runtime.
