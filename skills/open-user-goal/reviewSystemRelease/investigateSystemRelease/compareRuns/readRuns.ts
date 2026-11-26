import {systemReleaseEvidence} from "natlang:services";
import type {ReleaseAssignment, RetainedRunPair} from "../types.js";
/** Read both scoped native System run headers, without replaying execution. */
export default async function readRuns(assignment: ReleaseAssignment):Promise<RetainedRunPair>{
 return systemReleaseEvidence.compare(assignment.id);
}
