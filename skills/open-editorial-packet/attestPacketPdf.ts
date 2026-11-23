import {editorialPdf} from "natlang:services";
import type {PacketEvidence, PacketPdf} from "./types.js";
/** Verify that the selected lines came from this exact local PDF snapshot. */
export default async function attestPacketPdf(report: PacketPdf):Promise<PacketEvidence>{
 return editorialPdf.attest(report);
}
