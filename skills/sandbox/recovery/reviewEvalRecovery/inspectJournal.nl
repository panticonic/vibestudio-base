---
description: Assess the native journal for the exact assigned text-store effect.
args:
  attempt: EvalRecoveryAttempt
returns: EvalRecoveryJournalFinding
---
Call compareReceipts with the attempt and return its assessment. Use the native journal even when the cell failed. The cell result alone does not establish any store.
