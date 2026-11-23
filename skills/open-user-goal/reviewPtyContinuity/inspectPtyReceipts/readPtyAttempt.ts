import {ptyContinuityEvidence} from "natlang:services";
import type {PtyCheck, PtyObservation} from "../types.js";
/** Obtain one scoped live session and framed resume observation. */
export default async function readPtyAttempt(attempt: PtyCheck):Promise<PtyObservation | null>{
 return ptyContinuityEvidence.inspect(attempt.sessionId);
}
