import {templateCandidateReview} from "natlang:services";
import type {CandidateState} from "../../types.js";
/** Read the exact operation and current protected main event for comparison. */
export default async function readCandidate():Promise<CandidateState | null>{
 return templateCandidateReview.read();
}
