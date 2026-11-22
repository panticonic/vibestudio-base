---
description: Resolve an owned operating handoff from native recovery and the current local directive.
args:
  goal: string
  recovery: EvalHandoffGoalReport
returns: RecoveryHandoffOutcome
budget: { maxTurns: 14 }
---
1. Call readDirective to learn the actual recipient, revision, workspace status and release scope. Compare that directive with the user's desired recipient and scope.
2. If the native recovery did not select an authorized verified result, return held-eval with the actual recovery and directive, a grounded reason, and handoff null. A canceled or read-only directive, or a different audience from the user's request, means held-policy with no handoff. Report the behavior the user actually requested.
3. Call acquireSources with the unchanged recovery and directive when native evidence and the user's scope permit a local artifact. If it refuses the stale directive or source, return held-policy with its current directive and no handoff.
4. Call scratch.assembleHandoff using the returned request unchanged. The installed scratch hierarchy reads the acquired sources, selects evidence and stages one local note only when supported. Read the directive again after that attempt. Return the exact scratch report and status, the original recovery, and the latest directive. In particular, distinguish unavailable source, unanswered question and unverified write from success.
