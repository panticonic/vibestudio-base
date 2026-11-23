import {workspaceShareEvidence} from "natlang:services";
import type {ShareObservation} from "../types.js";
/** Read the exact selected share and current local authority evidence. */
export default async function readShare(id: string):Promise<ShareObservation>{
 return workspaceShareEvidence.inspect(id);
}
