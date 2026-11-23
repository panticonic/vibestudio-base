import {editorialMission} from "natlang:services";
import type {PacketMission} from "./types.js";
/** Discover the exact owned publication mission and nearby lookalikes. */
export default async function listPacketMissions():Promise<PacketMission[]>{
 return editorialMission.list();
}
