---
description: Compare all observed text-store receipts with the assigned digest and byte length.
args:
  attempt: EvalRecoveryAttempt
returns: EvalRecoveryJournalFinding
---
Multiple stores or any contradictory store are mismatch. Use incomplete when the journal is truncated or unavailable. With a complete journal, use matched for one record whose digest and contentDigest equal expectedDigest and whose size equals expectedSize. Use absent when a complete journal contains no stores.
