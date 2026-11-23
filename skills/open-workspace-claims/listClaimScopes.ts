import {workspaceClaimRead} from "natlang:services";
import type {ClaimIndex} from "./types.js";
/** Discover the active workspace claim packet and any similarly named archive. */
export default async function listClaimScopes():Promise<ClaimIndex>{
 return workspaceClaimRead.list();
}
