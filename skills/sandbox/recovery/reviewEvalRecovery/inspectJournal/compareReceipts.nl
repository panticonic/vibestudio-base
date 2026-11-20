---
description: Compare all observed text-store receipts with the assigned digest and byte length.
args:
  attempt: EvalRecoveryAttempt
returns: EvalRecoveryJournalFinding
---
1. Compare each retained receipt with expectedDigest and expectedSize. A different digest, content digest, or size establishes mismatch. Two or more store receipts also establish mismatch, even when they repeat identical bytes.
2. If no mismatch was established and the journal is truncated or unavailable, return incomplete. A retained matching receipt does not establish that it was the only store. An empty retained prefix does not establish that the store was absent.
3. A complete journal with one exact receipt is matched. A complete journal with zero store receipts is absent.
