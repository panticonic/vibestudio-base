declare module "natlang:services" {
  export const terminalEvidenceRead: {
    inspect(operationId: string): Promise<import("./types.js").TerminalOperationEvidence>;
  };
}
