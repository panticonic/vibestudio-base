import {pdfIntakeProbe} from "natlang:services";
import type {ProbeReceipt} from "../types.js";
/** Read the exact assigned PDF's local probe projection. */
export default async function probeDocument(document: string):Promise<ProbeReceipt>{
 return pdfIntakeProbe.probe(document);
}
