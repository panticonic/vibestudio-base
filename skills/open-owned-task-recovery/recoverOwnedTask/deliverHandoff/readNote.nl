---
description: Recover the exact original local handoff receipt.
args:
  attempt: HandoffAttempt
returns: MessageReceipt | null
---
Call services.ownedTaskHandoff.read using attempt.attemptId. Return the actual receipt or null.
