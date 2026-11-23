import {sameTurnEvalEvidence} from "natlang:services";
import type {EvalAssignment, EvalCellEvidence} from "../types.js";
/** Read the exact caller-owned current EvalDO result and scope metadata. */
export default async function readNativeEvalState(assignment: EvalAssignment):Promise<EvalCellEvidence>{
 return sameTurnEvalEvidence.observe(assignment.id);
}
