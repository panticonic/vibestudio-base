import {skillMaintenanceEvidence} from "natlang:services";
import type {SkillMaintenanceCard, SkillMaintenanceCheck} from "../types.js";
/** Independently re-read the verified working program after the decision. */
export default async function checkSkillReadback(card: SkillMaintenanceCard):Promise<SkillMaintenanceCheck>{
 return skillMaintenanceEvidence.readback(card.id);
}
