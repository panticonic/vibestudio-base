import {recordedQuestionDiscovery} from "natlang:services";
import type {RecordedCandidate, RecordedQuestion} from "../types.js";
/** Read compact exact results from the native semantic intent index. */
export default async function searchNativeRationale(assignment: RecordedQuestion, phrase: string):Promise<RecordedCandidate[]>{
 return recordedQuestionDiscovery.search(assignment.id, phrase);
}
