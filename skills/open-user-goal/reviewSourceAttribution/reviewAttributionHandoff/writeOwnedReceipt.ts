import {sourceOriginReceipt} from "natlang:services";
import type {SourceAttributionAssignment, SourceAttributionConclusion, SourceAttributionReceipt} from "../types.js";
/** Bind the local evidence note to current owned state and re-read its exact stored bytes. */
export default async function writeOwnedReceipt(assignment: SourceAttributionAssignment, state: string, conclusion: SourceAttributionConclusion):Promise<SourceAttributionReceipt>{
 return sourceOriginReceipt.retain(assignment.id, state, conclusion);
}
