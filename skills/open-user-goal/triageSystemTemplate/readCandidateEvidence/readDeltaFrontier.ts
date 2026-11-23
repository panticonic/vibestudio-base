import {systemCandidateRead} from "natlang:services";
import type {SystemCandidateFrontier} from "../../types.js";
/** Read the actual native VCS comparison at one staged event. */
export default async function readDeltaFrontier(id: string, event: string):Promise<SystemCandidateFrontier>{
 return systemCandidateRead.compare(id, event);
}
