import {sameTurnEvalRecovery} from "natlang:services";
import type {EvalAssignment, EvalCellEvidence, EvalPick, EvalRecoveryReceipt} from "./types.js";
/** Read the exact chosen useful result or do one bounded authorized current inspection. */
export default async function resolveSameTurnEval(assignment: EvalAssignment, evidence: EvalCellEvidence, pick: EvalPick):Promise<EvalRecoveryReceipt>{
 return sameTurnEvalRecovery.resolve(assignment.id, evidence.runId, pick.decision);
}
