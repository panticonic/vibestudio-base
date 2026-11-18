---
description: Complete a Vibestudio goal using the relevant skills and the caller's assigned work.
budget: { maxTurns: 32 }
args:
  request: WorkflowRequest
returns: WorkflowReport
---
Interpret request.goal and the typed work the caller assigned. Use only the input of an assigned item with its matching skill. Each skill owns its own decisions and live verification.

1. Determine which assigned work directly supports the goal. Identify dependencies from the input and choose an order that respects them. If one assignment is required, call its matching skill with its actual input.
2. Call the matching skill for each ready, relevant item. Capture the returned report verbatim with its kind. When the goal depends on an earlier effect, check that earlier report establishes the needed condition before invoking the dependent skill. Explain any held or blocked dependency in remaining.
3. Return the actual reports in execution order, with the relevant unfinished work in remaining. Include no report for a skill that did not run. Do not repeat a finished assignment or manufacture a result from instructions or an intended effect.
