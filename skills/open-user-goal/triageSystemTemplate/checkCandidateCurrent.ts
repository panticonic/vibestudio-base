import {systemCandidateRead} from "natlang:services";
import type {SystemCandidateGate} from "../types.js";
/** Confirm the exact native coordinate is still current. */
export default async function checkCandidateCurrent(id: string, event: string, coordinate: string):Promise<SystemCandidateGate>{
 return systemCandidateRead.confirm(id, event, coordinate);
}
