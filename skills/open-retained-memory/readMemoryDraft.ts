import {nativeRetainedMemory} from "natlang:services";
import type {MemoryFile} from "./types.js";
/** Read the owned uncommitted draft separately from historical memory. */
export default async function readMemoryDraft():Promise<MemoryFile | null>{
 return nativeRetainedMemory.workingFile();
}
