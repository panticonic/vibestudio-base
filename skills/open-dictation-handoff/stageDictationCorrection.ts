import {retainedDictationHandoff} from "natlang:services";
import type {DictationArtifact, DictationPlan, DraftReview} from "./types.js";
/** Write an authorized local review artifact for the current draft revision. */
export default async function stageDictationCorrection(plan: DictationPlan, review: DraftReview):Promise<DictationArtifact | null>{
 return retainedDictationHandoff.stage(plan, review);
}
