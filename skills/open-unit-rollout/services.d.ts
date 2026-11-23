declare module "natlang:services" {
  export const unitRolloutCatalog: { discover(): Promise<import("./types.js").RolloutUnit[]> };
  export const unitRolloutObserve: {
    inspect(unitId: string): Promise<import("./types.js").RolloutObservation>;
    read(unitId: string, revision: string, paths: string[]): Promise<import("./types.js").RolloutSource[]>;
  };
  export const unitRolloutEdit: { apply(unitId: string, revision: string, edits: import("./types.js").RolloutEdit[]): Promise<import("./types.js").RolloutApply> };
  export const unitRolloutVerify: { check(unitId: string, revision: string): Promise<import("./types.js").RolloutCheck> };
  export const unitRolloutCommit: { commit(unitId: string, revision: string): Promise<import("./types.js").RolloutCommit> };
}
