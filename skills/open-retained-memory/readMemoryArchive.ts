import {nativeRetainedMemory} from "natlang:services";
import type {MemoryFile} from "./types.js";
/** Resolve a recalled event to its native immutable record. */
export default async function readMemoryArchive(eventId: string):Promise<MemoryFile | null>{
 return nativeRetainedMemory.archivedFile(eventId);
}
