import {systemCandidateHandoff} from "natlang:services";
import type {SystemCandidatePlan, SystemCandidateReceipt} from "../types.js";
/** Record an approved private diagnosis for one current file coordinate. */
export default async function recordCandidateHandoff(id: string, event: string, coordinate: string, plan: SystemCandidatePlan):Promise<SystemCandidateReceipt | null>{
 return systemCandidateHandoff.record(id, event, coordinate, plan);
}
