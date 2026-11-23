import {imageCandidateOriginal} from "natlang:services";
import type {ImageRead} from "./types.js";
/** Verify the original content through the exact owned image asset. */
export default async function readImageOriginal(briefId: string, candidateId: string):Promise<ImageRead>{
 return imageCandidateOriginal.read(briefId, candidateId);
}
