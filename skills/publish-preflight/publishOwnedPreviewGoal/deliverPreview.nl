---
description: Advance one authorized journaled operation and read back its actual hosted preview.
args:
  goal: string
  targetId: string
  operationId: string
  preflight: PublishPreflightReport
returns: OwnedPreviewReport
budget: { maxTurns: 13 }
---
1. Call ownedPreviewPublication.advance once. If it reports a retryable interruption, use recoverPreviewStep to decide whether an exact retry is in scope. Resume only this operation if authorized. Retain its latest actual receipt.
2. After a submitted receipt, call ownedPreviewPublication.readback. If readback is pending, use recoverPreviewStep for the next action. Refresh the same hosted readback when authorized.
3. Return published only after verified readback, with its exact receipt and hosted evidence. Otherwise return incomplete, retaining the preflight and actual durable phase or unresolved readback. Set reason to null for a verified publication.
