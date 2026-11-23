import {recordedQuestionDiscovery} from "natlang:services";
import type {RecordedQuestion} from "./types.js";
/** Read the owned local review question and its visibility scope. */
export default async function discoverRecordedQuestion():Promise<RecordedQuestion>{
 return recordedQuestionDiscovery.discover();
}
