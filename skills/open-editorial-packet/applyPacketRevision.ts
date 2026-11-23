import {editorialRevision} from "natlang:services";
import type {PacketDocument, PacketWrite} from "./types.js";
/** Attempt one scoped native edit at the observed semantic version. */
export default async function applyPacketRevision(missionId: string, proposal: PacketDocument):Promise<PacketWrite>{
 return editorialRevision.apply(missionId, proposal);
}
