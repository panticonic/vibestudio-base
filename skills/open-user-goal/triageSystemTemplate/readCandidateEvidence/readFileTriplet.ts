import {systemCandidateRead} from "natlang:services";
import type {SystemCandidatePreview} from "../../types.js";
/** Read bounded base, local and incoming evidence at an exact file coordinate. */
export default async function readFileTriplet(id: string, event: string, coordinate: string):Promise<SystemCandidatePreview>{
 return systemCandidateRead.preview(id, event, coordinate);
}
