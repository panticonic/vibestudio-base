import {recordedQuestionGraph} from "natlang:services";
import type {RecordedCohort, RecordedCounteraction, RecordedQuestion} from "../types.js";
/** Inspect actual applied counteractions already scoped to the selected native work; counteractionRef names each counteraction. */
export default async function readRejectionRecord(assignment: RecordedQuestion, ref: string, cohort: RecordedCohort):Promise<RecordedCounteraction[]>{
 return recordedQuestionGraph.rejections(assignment.id, ref, cohort);
}
