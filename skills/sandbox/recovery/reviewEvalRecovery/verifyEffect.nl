---
description: Request a separate readback when the matching receipt and caller's assignment permit it.
args:
  attempt: EvalRecoveryAttempt
  finding: EvalRecoveryJournalFinding
returns: {readback: EvalRecoveryReadback | null, effect: EvalRecoveryEffect}
---
If finding is matched and allowReadback is true, call evalRecoveryReadback.read with the exact operationId and expectedDigest. Call assessReadback with its result and the attempt. Return the exact readback and effect. Otherwise return null and unchecked.
