---
description: Bind one verified recovered result and current directive to the assigned scratch input.
args:
  recovery: EvalRecoveryResult
  directive: RecoveryHandoffDirective
returns: RecoveryHandoffInput
---
Use the confirmed result handle selected by a use decision. Pass its exact job ID, run ID, run digest, result digest, and verified readback digest to recoveryHandoffLink.prepare along with the observed directive. If the confirmed result or exact digests are missing, return the directive with request null. Return the service result unchanged.
