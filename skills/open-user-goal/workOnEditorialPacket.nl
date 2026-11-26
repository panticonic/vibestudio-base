---
description: Reconcile an owned editorial packet using approved source evidence, current revision authority and the user's requested outcome.
args:
  goal: string
returns: EditorialPacketResult
---
Choose the intended mission with chooseEditorialMission from packet.listPacketMissions and inspect it through packet.readPacketSnapshot. Keep the opening observation and gather the relevant approved attachment evidence with reviewPacketSource. That child binds the actual attachment and attests its original PDF citations; preview text or a colleague's paraphrase cannot replace approved evidence.

For requested revisions, use proposeEditorialRevision to express the minimal supported edit and packet.applyPacketRevision to attempt it against the observed native version. A changed response requires a current snapshot and its approved evidence before reconsidering the edit through reconcileEditorialRevision. Reconsider as needed from actual current state; do not overwrite a coeditor's unrelated text or assume an attempted write succeeded. For review-only work, inspect and explain without making a revision.

Obtain the independently stored document with packet.readStoredPacket. Preserve actual proposals, reconciliations and native attempts in PacketEdit, together with the observations and source evidence used. Let decideEditorialHandoff assess this work and the user's requested private note. If a note is requested and permitted, pass the actual PacketReport to packet.writePacketHandoff and retain its real receipt; a decision alone does not establish a saved note. Return result with the stored document, truthful decision and optional note. Hold when source authority or a current condition does not support the requested change.
