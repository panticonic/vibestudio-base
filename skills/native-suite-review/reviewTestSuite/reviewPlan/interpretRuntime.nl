---
description: Identify runtime and native approval from the observed declaration.
args:
  plan: SuiteReviewPlan
returns: SuiteReviewRuntimeDecision
---
Copy plan.runtime. For native set nativeApproval true and explain that the verify operation goes through the native test adapter and its own approval in the workspace's native execution domain. For workerd or browser set nativeApproval false and name the declared Testbench route. Suite names and filter text have no effect on the runtime.
