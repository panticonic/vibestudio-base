import {skillMaintenanceEvidence} from "natlang:services";
import type {SkillMaintenanceCard, SkillMaintenanceCheck} from "../types.js";
/** Read the current owned working check; consume its actual feedback before claiming success. */
export default async function checkSkillReadback(card: SkillMaintenanceCard):Promise<SkillMaintenanceCheck>{
 return skillMaintenanceEvidence.readback(card.id);
}
