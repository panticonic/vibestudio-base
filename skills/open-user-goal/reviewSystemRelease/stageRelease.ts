import {systemReleaseHandoff} from "natlang:services";
import type {CaseEvidence, ReleaseAssessment, ReleaseAssignment, ReleaseReceipt, RunChoice} from "./types.js";
/** Write a canonical private handoff from the exact retained case evidence. */
export default async function stageRelease(assignment: ReleaseAssignment, choice: RunChoice, cases: CaseEvidence[], assessment: ReleaseAssessment):Promise<ReleaseReceipt | null>{
 return systemReleaseHandoff.stage(assignment.id, choice.runId, assessment.disposition, cases);
}
