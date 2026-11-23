import {pdfIntakeRead} from "natlang:services";
import type {BatchReceipt, ExtractionMode} from "../types.js";
/** Read a single authorized batch with its selected local extraction mode. */
export default async function readBatch(document: string, pages: number[], mode: ExtractionMode):Promise<BatchReceipt>{
 return pdfIntakeRead.read(document, pages, mode);
}
