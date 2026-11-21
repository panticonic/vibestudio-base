---
description: Atomically apply the authorized native document edit batch against its exact working revision.
budget: { maxTurns: 4 }
args:
  head: string
  drafts: RevisionDraft[]
returns: RevisionReceipt
---
Return the exact result of nativeCoordinatedRevision.revise(head, drafts).
