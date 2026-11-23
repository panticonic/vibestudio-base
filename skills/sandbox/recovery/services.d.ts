declare module "natlang:services" {
  export const evalRecoveryJournal: {
    observe(operationId: string): Promise<import("./types.js").EvalRecoveryAttempt>;
  };
  export const evalRecoveryReadback: {
    read(operationId: string, digest: string): Promise<import("./types.js").EvalRecoveryReadback>;
  };
}
