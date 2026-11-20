import { unitRolloutVerify } from "natlang:services";
import type { RolloutCheck } from "../../types.js";
export default function checkCandidate(unitId: string, revision: string): Promise<RolloutCheck> {
  return unitRolloutVerify.check(unitId, revision);
}
