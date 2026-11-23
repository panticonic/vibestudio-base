import {editorialWorkspace} from "natlang:services";
import type {PacketSnapshot} from "./types.js";
/** Read current mission, candidate text, attached PDF approvals and retained preview. */
export default async function readPacketSnapshot(missionId: string):Promise<PacketSnapshot | null>{
 return editorialWorkspace.read(missionId);
}
