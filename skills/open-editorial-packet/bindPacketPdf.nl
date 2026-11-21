---
description: Bind one owned PDF to the exact current mission approval and requested pages.
args:
  snapshot: PacketSnapshot
  plan: PacketPlan
  selection: PacketSourcePlan
returns: PacketReadRequest | null
---
Call editorialPdf.bind with the unchanged snapshot, plan, and selected attachment. Return the unchanged binding.
