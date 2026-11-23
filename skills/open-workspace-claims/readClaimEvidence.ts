import {workspaceClaimRead} from "natlang:services";
import type {ClaimEvidence} from "./types.js";
/** Observe independent native file and TestKit receipts for the selected candidate and earlier state. */
export default async function readClaimEvidence(id: string):Promise<ClaimEvidence | null>{
 return workspaceClaimRead.observe(id);
}
