---
description: Execute a caller-assigned plan of bounded terminal checks and verify the observed outcomes.
args:
  request: TerminalCheckRequest
returns: TerminalCheckReport
budget: { maxTurns: 24 }
---
1. Call readAssignedChecks with request.operationId. Keep the assignment receipt and ordered check list.
2. Call selectNextCheck with the goal, assigned checks and earlier outcomes. If it returns a check ID, call performCheck with that ID and the assignment receipt. Call classifyResult with the actual result and keep both. Continue until selectNextCheck returns null. Each assigned check can run once.
3. Return the assignment receipt, the observed outcomes in execution order, and the IDs of all remaining checks in assignment order. A held check has no process result.
