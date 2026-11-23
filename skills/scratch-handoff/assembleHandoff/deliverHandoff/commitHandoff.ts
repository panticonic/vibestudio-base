import {scratchHandoffWrite} from "natlang:services";
import type {ScratchReceipt} from "../../types.js";
/** Write and read back the one assigned scratch handoff. */
export default async function commitHandoff(body: string):Promise<ScratchReceipt | null>{
 return scratchHandoffWrite.stage(body);
}
