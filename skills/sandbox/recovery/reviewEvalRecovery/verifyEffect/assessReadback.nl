---
description: Compare the independent readback with the assigned content identity.
args:
  attempt: EvalRecoveryAttempt
  read: EvalRecoveryReadback
returns: EvalRecoveryEffect
---
An observedDigest of null means missing. Return confirmed only when both digests equal expectedDigest and the size equals expectedSize. Return different for other evidence.
