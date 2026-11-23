import {docPlanHandoff} from "natlang:services";
import type {CapabilityHandoff, CapabilityPlan} from "./types.js";
/** Stage an authorized local scratch handoff containing only the verified capability plan. */
export default async function stageCapabilityPlan(plan: CapabilityPlan):Promise<CapabilityHandoff | null>{
 return docPlanHandoff.stage(plan);
}
