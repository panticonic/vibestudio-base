import type { EvalRecoveryAttempt, EvalRecoveryReadback } from "./types.js";

declare module "natlang:services" {
  export const evalRecoveryJournal: {
    observe(operationId: string): Promise<EvalRecoveryAttempt>;
  };
  export const evalRecoveryReadback: {
    read(operationId: string, digest: string): Promise<EvalRecoveryReadback>;
  };
}
