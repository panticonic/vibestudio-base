import {transcriptMutation} from "natlang:services";
import type {SurfaceApproval, SurfaceAssignment, SurfaceDecision, SurfaceReceipt, SurfaceReplay} from "../types.js";
/** Verify the approved effect and basis immediately before native publication. */
export default async function mutateOwnedTranscript(assignment: SurfaceAssignment, approval: SurfaceApproval, replay: SurfaceReplay, decision: SurfaceDecision):Promise<SurfaceReceipt>{
 return transcriptMutation.apply(assignment.id, approval.id, replay.cursor, decision.effect);
}
