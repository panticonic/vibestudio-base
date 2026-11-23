import {transcriptApproval} from "natlang:services";
import type {SurfaceApproval, SurfaceAssignment} from "../types.js";
/** Read exact local candidate sources and approval coordinates. */
export default async function readCurrentApprovals(assignment: SurfaceAssignment):Promise<SurfaceApproval[]>{
 return transcriptApproval.list(assignment.id);
}
