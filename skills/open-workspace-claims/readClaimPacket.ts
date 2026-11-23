import {workspaceClaimRead} from "natlang:services";
import type {ClaimPacket} from "./types.js";
/** Read the exact selected packet tied to an owned candidate and named acceptance statements. */
export default async function readClaimPacket(id: string):Promise<ClaimPacket | null>{
 return workspaceClaimRead.read(id);
}
