import {skillMaintenanceEdit} from "natlang:services";
import type {SkillMaintenanceChange, SkillMaintenanceReceipt} from "../../types.js";
/** Apply the authored patch to its exact scoped working revision. */
export default async function stageSkillChanges(id: string, revision: string, changes: SkillMaintenanceChange[]):Promise<SkillMaintenanceReceipt>{
 return skillMaintenanceEdit.stage(id, revision, changes);
}
