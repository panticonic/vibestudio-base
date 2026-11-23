import {recordedQuestionGraph} from "natlang:services";
import type {RecordedCohort, RecordedCounteraction, RecordedQuestion} from "../types.js";
/** Inspect the actual applied counteractions for the selected native work. */
export default async function readRejectionRecord(assignment: RecordedQuestion, ref: string, cohort: RecordedCohort):Promise<RecordedCounteraction[]>{
 return recordedQuestionGraph.rejections(assignment.id, ref, cohort);
}
