import type { SuiteReviewExecution, SuiteReviewPlan } from "./types.js";

declare module "natlang:services" {
  export const testSuitePlanRead: {
    resolve(operationId: string): Promise<SuiteReviewPlan>;
  };
  export const testSuiteVerificationRun: {
    run(operationId: string, stateHash: string): Promise<SuiteReviewExecution>;
  };
}
