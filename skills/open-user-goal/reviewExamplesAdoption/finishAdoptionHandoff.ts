import type {AdoptionPlan, AdoptionReceipt, AdoptionOutcome} from "../types.js";
/** The application result of this operation: an actual native handoff or its disposition. */
export default function finishAdoptionHandoff(plan: AdoptionPlan, receipt: AdoptionReceipt | null):AdoptionOutcome{ return receipt ?? {disposition:plan.disposition,finding:plan.finding}; }
