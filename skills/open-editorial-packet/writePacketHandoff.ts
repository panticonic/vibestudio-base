import {editorialHandoff} from "natlang:services";
import type {PacketReceipt, PacketReport} from "./types.js";
/** Stage one explicitly authorized private handoff with the actual candidate revision. */
export default async function writePacketHandoff(report: PacketReport):Promise<PacketReceipt | null>{
 return editorialHandoff.stage(report);
}
