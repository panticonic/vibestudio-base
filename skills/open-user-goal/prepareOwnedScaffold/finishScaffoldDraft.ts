import type {ScaffoldPlan, ScaffoldReceipt, ScaffoldOutcome} from "../types.js";
/** The application result of this operation: an actual native handoff or its disposition. */
export default function finishScaffoldDraft(plan: ScaffoldPlan, receipt: ScaffoldReceipt | null):ScaffoldOutcome{ return receipt ?? {disposition:plan.disposition,finding:plan.finding}; }
