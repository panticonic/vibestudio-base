import {openEvalCatalog} from "natlang:services";
import type {OpenEvalObservation} from "./types.js";
/** Read exact terminal identity and scope for a chosen original attempt. */
export default async function openEvalAttempt(jobId: string, runId: string):Promise<OpenEvalObservation | null>{
 return openEvalCatalog.open(jobId, runId);
}
