declare module "natlang:services" {
  export const terminalCheckRead: {
    observe(operationId: string): Promise<import("./types.js").TerminalPlan>;
  };
  export const terminalCheckRun: {
    execute(
      assignmentReceipt: string,
      checkId: string,
    ): Promise<import("./types.js").TerminalCheckResult>;
  };
}
