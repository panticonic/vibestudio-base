import type {GrimoirePlan, GrimoireSceneReceipt, GrimoireSceneOutcome} from "../types.js";
/** The application result of this operation: an actual native handoff or its disposition. */
export default function finishSceneHandoff(plan: GrimoirePlan, receipt: GrimoireSceneReceipt | null):GrimoireSceneOutcome{ return receipt ?? {action:plan.action,finding:plan.finding}; }
