import nativeRead from "../workspace/readImageOriginal.js";
import type {ImageRead} from "../types.js";
/** Exact owned native adapter; the semantic investigation chooses when to read. */
export default function readImageOriginal(briefId:string,candidateId:string):Promise<ImageRead>{return nativeRead(briefId,candidateId);}
