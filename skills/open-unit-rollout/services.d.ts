import type { RolloutApply, RolloutCheck, RolloutCommit, RolloutEdit, RolloutObservation, RolloutSource, RolloutUnit } from "./types.js";

declare module "natlang:services" {
  export const unitRolloutCatalog: { discover(): Promise<RolloutUnit[]> };
  export const unitRolloutObserve: {
    inspect(unitId: string): Promise<RolloutObservation>;
    read(unitId: string, revision: string, paths: string[]): Promise<RolloutSource[]>;
  };
  export const unitRolloutEdit: { apply(unitId: string, revision: string, edits: RolloutEdit[]): Promise<RolloutApply> };
  export const unitRolloutVerify: { check(unitId: string, revision: string): Promise<RolloutCheck> };
  export const unitRolloutCommit: { commit(unitId: string, revision: string): Promise<RolloutCommit> };
}
