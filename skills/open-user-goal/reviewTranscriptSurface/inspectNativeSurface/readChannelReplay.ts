import {transcriptObservation} from "natlang:services";
import type {SurfaceApproval, SurfaceAssignment, SurfaceReplay} from "../types.js";
/** Read actual durable inline and bar state from the approved channel. */
export default async function readChannelReplay(assignment: SurfaceAssignment, approval: SurfaceApproval):Promise<SurfaceReplay>{
 return transcriptObservation.replay(assignment.id, approval.id);
}
