---
description: Decide whether the stored candidate is ready for private review with exact provenance.
args:
  goal: string
  plan: PacketPlan
  opening: PacketSnapshot
  current: PacketSnapshot
  sources: PacketSource[]
  edit: PacketEdit
returns: PacketDecision
---
Explain the approved evidence, the actual stored revision, and any discarded preview or staleness that matters to the user's request. Choose ready after verified write, already-current if the same correction was already present, reviewed for a supported read-only decision, or held if evidence, approval or coedit scope prevents completion. Set write only for an expressly authorized private diagnostic or ready-only result. Do not imply that the candidate is published or public.
