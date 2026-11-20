import { unitRolloutEdit } from "natlang:services";
import type { RolloutApply, RolloutEdit } from "../../types.js";
export default function applyEdit(unitId: string, revision: string, edits: RolloutEdit[]): Promise<RolloutApply> {
  return unitRolloutEdit.apply(unitId, revision, edits);
}
