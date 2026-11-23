import {skillMaintenanceEvidence} from "natlang:services";
import type {SkillMaintenanceCard, SkillMaintenanceGate} from "../types.js";
/** Observe whether local edit authority still binds the inspected revision. */
export default async function confirmSkillFrontier(card: SkillMaintenanceCard, revision: string):Promise<SkillMaintenanceGate>{
 return skillMaintenanceEvidence.confirm(card.id, revision);
}
