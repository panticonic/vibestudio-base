import reviewDictation from "./reviewRetainedDictation/dictation/reviewDictation.nl";
import type {RetainedTranscript,DictationDraftWitness} from "./types.js";
/** Preserve the original transcript and request around the installed draft judgment. */
export default async function reviewRetainedDictation(goal:string,transcript:RetainedTranscript):Promise<DictationDraftWitness>{
 return {goal,transcript,presentation:"verbatim",result:await reviewDictation.prepareDraft(transcript,"verbatim",goal)};
}
