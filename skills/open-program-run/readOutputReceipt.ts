import {programExecution} from "natlang:services";
import type {ProgramOutputReceipt} from "./types.js";
/** Read back the retained native attempt and independently check source and output. */
export default async function readOutputReceipt(receiptId: string):Promise<ProgramOutputReceipt | null>{
 return programExecution.read(receiptId);
}
