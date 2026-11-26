import type {SystemCandidatePlan, SystemCandidateReceipt, SystemCandidateOutcome} from "../types.js";
/** The application result of this operation: an actual native handoff or its disposition. */
export default function finishCandidateHandoff(plan: SystemCandidatePlan, receipt: SystemCandidateReceipt | null):SystemCandidateOutcome{ return receipt ?? {finding:plan.finding}; }
