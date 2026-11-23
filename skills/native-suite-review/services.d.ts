declare module "natlang:services" {
  export const testSuitePlanRead: {
    resolve(operationId: string): Promise<import("./types.js").SuiteReviewPlan>;
  };
  export const testSuiteVerificationRun: {
    run(operationId: string, stateHash: string): Promise<import("./types.js").SuiteReviewExecution>;
  };
}
