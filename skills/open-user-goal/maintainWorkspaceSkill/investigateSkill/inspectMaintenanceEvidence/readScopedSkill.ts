import {skillMaintenanceEvidence} from "natlang:services";
import type {SkillMaintenanceObservation} from "../../../types.js";
/** Read the exact owned reusable skill. */
export default async function readScopedSkill(id: string):Promise<SkillMaintenanceObservation>{
 return skillMaintenanceEvidence.inspect(id);
}
