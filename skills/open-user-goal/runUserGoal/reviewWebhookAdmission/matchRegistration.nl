---
description: Join the exact retained registration and its current owner-visible state.
args:
  assignment: WebhookAdmissionAssignment
  evidence: WebhookAdmissionEvidence
returns: WebhookAdmissionBinding
---
1. Without a retained witness for the assignment's exact registration, return hold-receipt and a null row. If the witness identifies another context, return hold-scope and a null row.
2. Find only the exact registration ID in history and in active rows. Return hold-revoked with a null row if history records a revocation. Return hold-record with a null row if the exact active row is absent. A same-looking current label is insufficient.
3. If the witness creation or update time mismatches the active row, or the witness digest differs from the exact active row digest or there is no retained evidence digest, return hold-receipt and a null row. Otherwise return that active row and null hold.
