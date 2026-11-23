import {ptyContinuityHandoff} from "natlang:services";
import type {PtyDecision, PtyObservation, PtyReceipt} from "./types.js";
/** Retain exact reviewed output metadata in the assigned local scratch. */
export default async function stagePtyReceipt(observed: PtyObservation, decision: PtyDecision):Promise<PtyReceipt>{
 return ptyContinuityHandoff.stage(observed.sessionId, observed.replayDigest, decision.disposition);
}
