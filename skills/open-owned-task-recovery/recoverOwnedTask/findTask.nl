---
description: Locate the exact owned task card and its current dependency state.
args:
  goal: string
returns: TaskView | null
budget: { maxTurns: 10 }
---
Call listTasks. ReadTask for plausible matches. Use project, purpose, current owner and attempt to disambiguate duplicate titles. Return the exact permitted task snapshot or null.
