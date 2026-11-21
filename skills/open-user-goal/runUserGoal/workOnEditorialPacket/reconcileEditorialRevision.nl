---
description: Reconcile an exact stale edit with the latest mission and freshly verified evidence.
args:
  goal: string
  opening: PacketSnapshot
  current: PacketSnapshot
  proposal: PacketDocument
  earlier: PacketSource
  refreshed: PacketSource
returns: string | null
---
Call the installed policy.reconcileRevision with goal, original opening candidate, proposal.text, current candidate, the refreshed attested evidence document when present, and research null. Do not use the child's text if the mission grant was revoked or the matching quotes changed. A different edit to the same requested field must hold. An identical change from the co-editor is already current. A harmless unrelated edit stays in the replacement.
