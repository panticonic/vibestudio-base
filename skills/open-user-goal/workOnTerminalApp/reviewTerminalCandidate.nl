---
description: Decide whether and how to change the observed terminal app source.
args:
  goal: string
  app: TerminalRepairApp
  check: TerminalRepairCheck
returns: TerminalRepairPlan
---
1. Call judgeRepairScope with the app and current evidence. If its decision is hold-edit, hold-test, existing, or blocked, preserve the disposition and keep no edits.
2. For a repair, call planTerminalEdit with the current source and original goal. Return its exact plan.
