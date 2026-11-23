import discoverAttempts from "./recoverAgentCapability/discoverAttempts.js";
import continueCapability from "./recoverAgentCapability/continueCapability.js";
import inspectAttempt from "./recoverAgentCapability/inspectAttempt.nl";
import decideContinuation from "./recoverAgentCapability/decideContinuation.nl";
import type {AgentCapabilityOutcome} from "./recoverAgentCapability/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function recoverAgentCapability(goal:string):Promise<AgentCapabilityOutcome>{
 const assignment=await discoverAttempts();
 const evidence=await inspectAttempt(assignment,goal);
 const finding=await decideContinuation(assignment,evidence);
 const continuation=finding.decision==="confirm-continuation"||finding.decision==="retry-exact-step"?await continueCapability(evidence.current,finding.decision):null;
 return {finding,continuation};
}
