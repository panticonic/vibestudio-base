---
description: Choose the next ready check for the caller's goal.
args:
  goal: string
  checks: TerminalCheck[]
  outcomes: TerminalCheckOutcome[]
returns: string | null
---
Consider every check without a prior outcome. A check is ready only if every prerequisite has an observed passed outcome. Choose a ready check that advances the goal. When several are equally relevant, prefer assignment order. A failed prerequisite holds its dependents. Continue independent checks. Return null when no relevant check is ready.
