---
description: Pick admissible exact retained evidence from a nominated and earlier run.
args:
  assignment: ReleaseAssignment
returns: ComparedRelease
budget: { maxTurns: 14 }
---
Call readRuns with the actual assignment. Call chooseRun with the assignment and pair. Return both the exact pair and the actual choice.
