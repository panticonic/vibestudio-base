import {localWidthEvidence} from "natlang:services";
import type {WidthReceipt} from "../types.js";
/** Read one exact assigned execution attendance receipt. */
export default async function readWitness(id: string):Promise<WidthReceipt>{
 return localWidthEvidence.readWitness(id);
}
