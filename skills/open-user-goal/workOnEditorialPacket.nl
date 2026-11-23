---
description: Resolve a local publication candidate against current approved mission and PDF evidence.
budget: { maxTurns: 52 }
args:
  goal: string
returns: EditorialPacketResult
---
1. Call packet.listPacketMissions. Call chooseEditorialMission with actual cards and the unchanged goal. Read the exact opening through packet.readPacketSnapshot.
2. Call reviewPacketSource on opening and plan. Preserve every exact evidence receipt. When the plan calls for a revision and the evidence is grounded, call proposeEditorialRevision on the exact candidate and supporting documents. Keep the returned proposal. If proposed text already matches the workspace, skip the write.
3. For a differing valid proposal, call packet.applyPacketRevision once. If it reports changed, read the same mission and target again, call reviewPacketSource again with the fresh snapshot, and call reconcileEditorialRevision with both snapshots, the original proposal, and refreshed evidence. If its text differs from the fresh snapshot, call packet.applyPacketRevision at the fresh version once. Keep all exact outcomes. A revoked grant, changed citation basis, or competing change to the same claim holds the edit.
4. Call packet.readStoredPacket on the exact mission. Call decideEditorialHandoff with the unchanged goal, exact plan, both snapshots, ordered sources and actual edit including stored version. When it requests a private local note, call packet.writePacketHandoff with the report and include its receipt. Call result with the actual stored document, settled decision and any private note receipt (null when none was written). Return that exact application result.
