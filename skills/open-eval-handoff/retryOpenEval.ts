import {openEvalReentry} from "natlang:services";
import type {OpenEvalObservation} from "./types.js";
/** Start one new exact native attempt only under the original caller grant. */
export default async function retryOpenEval(jobId: string, runId: string):Promise<OpenEvalObservation | null>{
 return openEvalReentry.retry(jobId, runId);
}
