---
description: Decide whether and how to change the observed terminal app source.
args:
  goal: string
  app: TerminalRepairApp
  check: TerminalRepairCheck
returns: TerminalRepairPlan
---
Return the plan for this user's actual request using the observed source, build diagnostics and native tests. Keep permission to mutate separate from whether the user asked for a mutation.

Use judgeRepairScope to interpret the actual authority and verified execution evidence. Use explainTerminalObservation for the user's requested diagnostic or held-action findings. An authorized repair plan already supplies its own grounded reason. A permission hold does not replace a requested diagnosis: preserve what can actually be established from the supplied source and tests, and distinguish evidence that is unavailable.

For a diagnostic or read-only request, return diagnosed with no edits and the grounded explanation. When the user requests a repair but the actual scope is hold-edit, hold-test, existing or blocked, preserve that scope and keep no edits, including the requested findings in the reason. For an authorized requested repair, use planTerminalEdit with the actual source and original goal. Keep its exact before/after edits and grounded reason. Do not turn a query into a source change or claim any native run or effect that was not observed.
