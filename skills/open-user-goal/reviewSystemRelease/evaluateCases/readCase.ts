import {systemReleaseEvidence} from "natlang:services";
import type {CaseEvidence, ReleaseAssignment, RunChoice} from "../types.js";
/** Read exact bounded facts from the selected retained case pages. */
export default async function readCase(assignment: ReleaseAssignment, choice: RunChoice, name: string):Promise<CaseEvidence>{
 return systemReleaseEvidence.inspectCase(assignment.id, choice.runId, name);
}
