import nativeRead from "../workspace/discoverDictationThreads.js";
import type {DictationThread} from "../types.js";
/** Exact owned native adapter; the semantic investigation chooses when to read. */
export default function discoverDictationThreads():Promise<DictationThread[]>{return nativeRead();}
