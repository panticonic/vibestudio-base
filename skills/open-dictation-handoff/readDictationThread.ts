import {retainedDictationState} from "natlang:services";
import type {DictationSnapshot} from "./types.js";
/** Read the exact retained frontier of one owned dictation conversation. */
export default async function readDictationThread(threadId: string):Promise<DictationSnapshot | null>{
 return retainedDictationState.read(threadId);
}
