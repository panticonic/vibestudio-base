import {sameTurnEvalEvidence} from "natlang:services";
import type {EvalAssignment} from "./types.js";
/** Identify the exact requested result and approved recovery methods. */
export default async function discoverSameTurnEval():Promise<EvalAssignment>{
 return sameTurnEvalEvidence.discover();
}
