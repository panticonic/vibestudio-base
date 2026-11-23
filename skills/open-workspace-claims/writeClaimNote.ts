import {workspaceClaimHandoff} from "natlang:services";
import type {ClaimHandoff, WorkspaceClaimReview} from "./types.js";
/** Retain the caller-authorized private claim decision with exact evidence. */
export default async function writeClaimNote(report: WorkspaceClaimReview):Promise<ClaimHandoff | null>{
 return workspaceClaimHandoff.stage(report);
}
