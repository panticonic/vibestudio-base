---
description: Decide readiness or hold from exact semantic state, dependency and independently retained build evidence.
args:
  goal: string
  inventory: AssemblyInventory
  scope: AssemblyScope
  dependencies: AssemblyDependencies
  builds: AssemblyBuildReceipt[]
returns: AssemblyPlan
---
Use ready for sufficient and current evidence, hold for a blocker, unchanged when the user asked whether action is necessary and the current state already meets that request, and draft-repair when the user explicitly permits a local manifest proposal for a known dependency mismatch. An actual failed build adds build-failed. A required review of a different head adds review-changed even if paths look familiar. A read-only request can be ready without writing anything. Explain why the specific evidence supports the choice, including a material manifest or source fact. Copy the actual root, head and all build receipts unchanged.
