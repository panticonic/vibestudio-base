import {nativeRetainedMemory} from "natlang:services";
import type {MemoryBrief} from "./types.js";
/** Observe the exact owned channel and repository named by the request. */
export default async function identifyMemoryScope():Promise<MemoryBrief>{
 return nativeRetainedMemory.brief();
}
