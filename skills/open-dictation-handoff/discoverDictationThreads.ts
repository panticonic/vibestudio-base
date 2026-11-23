import {retainedDictationIndex} from "natlang:services";
import type {DictationThread} from "./types.js";
/** Read the current owned dictation conversation index. */
export default async function discoverDictationThreads():Promise<DictationThread[]>{
 return retainedDictationIndex.list();
}
