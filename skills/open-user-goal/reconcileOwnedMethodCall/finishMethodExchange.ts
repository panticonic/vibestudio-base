import type {LocalMethodPlan, LocalMethodReport, LocalMethodOutcome} from "../types.js";
/** The application result of this operation: an actual native handoff or its disposition. */
export default function finishMethodExchange(plan: LocalMethodPlan, terminal: LocalMethodReport | null):LocalMethodOutcome{ return terminal ?? {action:plan.action,finding:plan.finding}; }
