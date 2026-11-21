---
description: Judge actual installed behavior versus the approved exact acceptance data.
args:
  assignment: SmokeAssignment
  selection: SmokeSelection
  runtime: "SmokeRuntime | null"
returns: SmokeDecision
---
If the selection is blocked, report that disposition with mayRetain false.
If there is no callable exact export in the runtime observation, report hold-export with mayRetain false.
Compare actual runtime.value and selection.plan.accepted recursively. Array order matters, object key order does not.
Different data means regression with mayRetain false.
Matching data means accepted. mayRetain is assignment.mayStage.
