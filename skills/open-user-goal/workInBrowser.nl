---
description: Discover the current workspace panel, carry out a requested change, and verify its visible result.
budget: { maxTurns: 16 }
args:
  goal: string
returns: BrowserGoalReport
---
1. Inspect the panel through goalBrowser.inspect. Give the goal and that observation to choosePanelAction. If it returns report, return the requested rows with their exact visible label, state and detail, and the observed revision. If it returns blocked, preserve the reason.
2. If a change is authorized, activate the selected visible control against that observation's revision. Inspect again after every attempt. If the state changed before activation, use the new observation to choose what to do next.
3. For a goal with several changes, ask choosePanelAction again using the current panel. Continue only for an authorized, unfinished part of the goal. Check each visible effect before proceeding to the next one.
4. When the goal is fulfilled, return the affected rows as they now appear and the current revision. If a required change cannot be confirmed, describe what remains unresolved.
