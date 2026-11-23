---
description: Resolve an owned operating handoff from native recovery and the current local directive.
args:
  goal: string
  recovery: EvalRecoveryResult
returns: RecoveryHandoffOutcome
budget: { maxTurns: 14 }
---
1. Call readDirective to learn the actual recipient, revision, workspace status and release scope. Compare that directive with the user's desired recipient and scope.
2. If the native recovery did not select an authorized verified result, return held-eval with a grounded reason and null handoff. A canceled or read-only directive, or a different audience from the user's request, means held-policy with no handoff. Report the behavior the user actually requested.
3. Call acquireSources with the unchanged recovery and directive when native evidence and the user's scope permit a local artifact. If it refuses the stale directive or source, return held-policy with its current directive and no handoff.
4. Call scratch.assembleHandoff using the returned request unchanged. The installed scratch hierarchy reads the acquired sources, selects evidence and stages one local note only when supported. Read the directive again after that attempt. Return the actual scratch report in handoff, the actual status and grounded reason. The recovery identity and directive stay internal. In particular, distinguish unavailable source, unanswered question and unverified write from success.
