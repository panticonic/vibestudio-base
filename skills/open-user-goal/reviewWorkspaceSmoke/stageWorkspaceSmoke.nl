---
description: Retain the exact authorized successful smoke receipt locally.
args:
  assignment: SmokeAssignment
  selection: SmokeSelection
  runtime: SmokeRuntime
  decision: SmokeDecision
returns: SmokeReceipt
---
Return workspaceSmokeHandoff.stage(assignment.id, selection.plan.path, runtime.runDigest).
