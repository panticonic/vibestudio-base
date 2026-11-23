import {systemCandidateRead} from "natlang:services";
import type {SystemCandidateReadback} from "../types.js";
/** Independently read the exact private file and current owned review. */
export default async function verifyCandidateHandoff(id: string, path: string | null):Promise<SystemCandidateReadback>{
 return systemCandidateRead.readback(id, path);
}
