import nativeRead from "../workspace/readImageJournal.js";
import type {ImageJournal} from "../types.js";
/** Exact owned native adapter; the semantic investigation chooses when to read. */
export default function readImageJournal(channelId:string):Promise<ImageJournal|null>{return nativeRead(channelId);}
