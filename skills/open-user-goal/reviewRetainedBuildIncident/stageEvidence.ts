import {buildIncidentHandoff} from "natlang:services";
import type {IncidentFocus, IncidentReceipt} from "./types.js";
/** Write one local scratch note tied to the exact approved build checkpoint identities. */
export default async function stageEvidence(checkpoints: string[], focus: IncidentFocus):Promise<IncidentReceipt | null>{
 return buildIncidentHandoff.stage(checkpoints, focus);
}
