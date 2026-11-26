import nativeRead from "../workspace/readDictationThread.js";
import type {DictationSnapshot} from "../types.js";
/** Exact owned native adapter; the semantic investigation chooses when to read. */
export default function readDictationThread(threadId:string):Promise<DictationSnapshot|null>{return nativeRead(threadId);}
