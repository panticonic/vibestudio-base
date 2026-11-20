import { unitRolloutCommit } from "natlang:services";
import type { RolloutCommit } from "../types.js";
export default function commitCandidate(unitId: string, revision: string): Promise<RolloutCommit> {
  return unitRolloutCommit.commit(unitId, revision);
}
