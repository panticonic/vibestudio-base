import {testkitCloseout} from "natlang:services";
import type {CloseoutReceipt, CloseoutDecision} from "./types.js";
/** Save the current and prior evidence to the authorized private closeout lane. */
export default async function stageCloseoutEvidence(decision: CloseoutDecision):Promise<CloseoutReceipt>{
 return testkitCloseout.stage(decision);
}
