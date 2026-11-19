---
description: Separate the allowed observed report attachments from selected but incomplete ones.
args:
  receipts: ProblemEvidenceReceipt[]
returns: {selected:string[]; incomplete:string[]}
---
Use only rows explicitly selected by the caller. Return observed IDs in selected. Put denied, expired, and unavailable selected IDs in incomplete. Preserve the order in each list and omit all other IDs.
