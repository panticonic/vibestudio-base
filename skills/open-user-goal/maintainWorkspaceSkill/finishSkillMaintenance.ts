import type {SkillMaintenanceDecision, SkillMaintenanceReceipt, SkillMaintenanceOutcome} from "../types.js";
/** The application result of this operation: an actual native handoff or its disposition. */
export default function finishSkillMaintenance(decision: SkillMaintenanceDecision, receipt: SkillMaintenanceReceipt | null):SkillMaintenanceOutcome{ return receipt ?? decision; }
