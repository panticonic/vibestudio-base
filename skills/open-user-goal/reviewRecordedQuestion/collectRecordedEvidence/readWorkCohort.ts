import {recordedQuestionGraph} from "natlang:services";
import type {RecordedCohort, RecordedQuestion} from "../types.js";
/** Read the actual scoped semantic cohort set and per-path count. */
export default async function readWorkCohort(assignment: RecordedQuestion, ref: string):Promise<RecordedCohort>{
 return recordedQuestionGraph.cohort(assignment.id, ref);
}
