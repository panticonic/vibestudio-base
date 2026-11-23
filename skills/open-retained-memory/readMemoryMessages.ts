import {nativeRetainedMemory} from "natlang:services";
import type {MemoryMessage} from "./types.js";
/** Read the original native conversation envelopes for the owned channel. */
export default async function readMemoryMessages(channelId: string):Promise<MemoryMessage[]>{
 return nativeRetainedMemory.transcript(channelId);
}
