import {nativeRetainedMemory} from "natlang:services";
import type {MemoryKind, MemoryLead} from "./types.js";
/** Search bounded actual workspace memory for the chosen evidence kinds. */
export default async function recallMemoryLeads(query: string, kinds: MemoryKind[]):Promise<MemoryLead[]>{
 return nativeRetainedMemory.recall(query, kinds);
}
