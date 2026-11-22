---
description: Bind one verified recovered result and current directive to the assigned scratch input.
args:
  recovery: EvalHandoffGoalReport
  directive: RecoveryHandoffDirective
returns: RecoveryHandoffInput
---
Use the trial selected by a use decision. Pass exact job ID, selected run ID, run digest, result digest, and verified readback digest to recoveryHandoffLink.prepare along with the observed directive. If the trial or exact digests are missing, return the directive with request null. Return the service result unchanged.
