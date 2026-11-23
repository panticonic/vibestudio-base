import {testkitCloseout} from "natlang:services";
import type {CloseoutReceipt, CloseoutReport} from "./types.js";
/** Save the current and prior evidence to the authorized private closeout lane. */
export default async function stageCloseoutEvidence(report: CloseoutReport):Promise<CloseoutReceipt>{
 return testkitCloseout.stage(report);
}
