import {scratchHandoffRead} from "natlang:services";
import type {SourceRead} from "../../types.js";
/** Read the identified caller-assigned file in this workspace context. */
export default async function readSource(id: string):Promise<SourceRead | null>{
 return scratchHandoffRead.read(id);
}
