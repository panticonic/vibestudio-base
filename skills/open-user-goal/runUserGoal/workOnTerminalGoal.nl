---
description: Complete an owned project outcome with observed release checklist state, native checks, and authorized terminal actions.
budget: { maxTurns: 36 }
args:
  goal: string
returns: TerminalGoalReport
---
1. Call terminal.openTerminal. Keep its exact response with the first live checklist screen. Start with an empty event list, no terminal check report, and no handoff.
2. Call chooseTerminalAction with the user's goal, opening information and all actual progress. Perform the chosen action. For change call terminal.applyChecklistChange. For transition call terminal.advanceTerminal. Preserve each actual event. For a reattach, restart or resume event with both screens, call reviewTransition using the unchanged event. Require its verified result before dependent work. For check call checks.runTerminalChecks with the user's goal and the opening checkOperationId. Use its actual report and do not rerun it. For stage call terminal.stageTerminalHandoff. A null result is a refusal and cannot become a success. Finish when chooseTerminalAction returns finish or after at most twelve selected actions. Do not add actions to satisfy a guessed expectation.
3. Call composeTerminalOutcome with the goal and recorded progress. Return the opening screen, the exact ordered events, the actual check report or null, the actual handoff or null, and the returned summary.
