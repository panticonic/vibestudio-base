import type { TerminalCheckResult, TerminalPlan } from "./types.js";

declare module "natlang:services" {
  export const terminalCheckRead: {
    observe(operationId: string): Promise<TerminalPlan>;
  };
  export const terminalCheckRun: {
    execute(
      assignmentReceipt: string,
      checkId: string,
    ): Promise<TerminalCheckResult>;
  };
}
