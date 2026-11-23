import {ptyContinuityEvidence} from "natlang:services";
import type {PtyAssignment} from "./types.js";
/** Read the exact nominated terminal attempt, continuation request, and retention approval. */
export default async function discoverPtyReview():Promise<PtyAssignment>{
 return ptyContinuityEvidence.discover();
}
