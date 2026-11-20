declare module "natlang:services" {
  export const recoveryHandoffLink: {
    discover(): Promise<import("./runUserGoal/workOnRecoveryHandoff/contract.js").RecoveryHandoffDirective>;
    prepare(jobId: string, runId: string, runDigest: string, resultDigest: string, digest: string,
      directive: import("./runUserGoal/workOnRecoveryHandoff/contract.js").RecoveryHandoffDirective
    ): Promise<import("./runUserGoal/workOnRecoveryHandoff/contract.js").RecoveryHandoffInput>;
  };
  export const goalDiscovery: {
    search(queries: string[]): Promise<import("./types.js").GoalSearchResult[]>;
    snapshotTime(): number;
  };
  export const goalWorkspace: {
    list(): Promise<string[]>;
    read(path: string): Promise<import("./types.js").WorkspaceRevision | null>;
    revise(path: string, version: string, text: string): Promise<import("./types.js").WorkspaceWrite>;
  };
  export const goalBrowser: {
    inspect(): Promise<import("./types.js").BrowserView>;
    activate(control: string, revision: string): Promise<"activated" | "changed" | "unavailable">;
  };
  export const goalSuite: {
    discover(): Promise<import("./types.js").OpenSuiteRoute[]>;
    prepare(choice: import("./types.js").OpenSuiteChoice): Promise<import("./types.js").OpenSuiteRequest | null>;
  };
  export const pdfVaultBridge: {
    bind(pdf: unknown, citationIndices: number[]): Promise<import("./types.js").PdfVaultHandoff>;
  };
}
