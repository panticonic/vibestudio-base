---
description: Invoke the exact safe installed public export using the selected file's fixture.
args:
  assignment: SmokeAssignment
  plan: SmokePlan
returns: SmokeRuntime
---
Return workspaceSmokeRuntime.run(assignment.id, plan.path, plan.digest).
