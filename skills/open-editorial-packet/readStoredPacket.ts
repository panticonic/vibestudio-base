import {editorialRevision} from "natlang:services";
import type {PacketDocument} from "./types.js";
/** Read the exact stored candidate revision from the private working workspace. */
export default async function readStoredPacket(missionId: string):Promise<PacketDocument | null>{
 return editorialRevision.read(missionId);
}
