---
description: Recover the status of an assigned operation after a VibeStudio eval attempt.
args:
  request: EvalRecoveryRequest
returns: EvalRecoveryReport
---
1. Call evalRecoveryJournal.observe with request.operationId. Retain the exact run identity and cell outcome.
2. Call inspectJournal on the attempt. Call verifyEffect using the attempt and journal finding.
3. Call chooseRecovery with the attempt, journal finding, and effect. Return the original run id and cell, journal finding, exact readback, effect and chosen recovery.
