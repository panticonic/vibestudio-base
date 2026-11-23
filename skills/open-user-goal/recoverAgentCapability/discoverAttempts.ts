import {agentCapabilityEvidence} from "natlang:services";
import type {ActionAssignment} from "./types.js";
/** Discover the owned capability recovery notebook and recorded revision candidates. */
export default async function discoverAttempts():Promise<ActionAssignment>{
 return agentCapabilityEvidence.discover();
}
