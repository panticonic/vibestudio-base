import {agentCapabilityContinue} from "natlang:services";
import type {ActionEvidence, CapabilityDecision, Continuation} from "./types.js";
/** Confirm an owned retained result or retry the exact approved bounded step once. */
export default async function continueCapability(evidence: ActionEvidence, decision: CapabilityDecision):Promise<Continuation | null>{
 return agentCapabilityContinue.apply(evidence.attempt.id, evidence.resultDigest, evidence.notebook.revision, decision);
}
