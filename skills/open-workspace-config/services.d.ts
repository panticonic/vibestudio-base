declare module "natlang:services" {
  export const nativeWorkspaceConfig: {
    readBrief(): Promise<import("./types.js").ConfigBrief>;
    inspectActive(questions: import("./types.js").ConfigQuestion[]): Promise<import("./types.js").ConfigIdentity | null>;
    inspectManifests(questions: import("./types.js").ConfigQuestion[]): Promise<import("./types.js").ConfigHistory | null>;
    inspectDependencies(mainEvent: string): Promise<import("./types.js").ConfigDependencies | null>;
  };
  export const nativeConfigHandoff: {
    stage(brief: import("./types.js").ConfigBrief, lens: import("./types.js").ConfigLens, evidence: import("./types.js").ConfigEvidence, outcome: import("./types.js").ConfigOutcome): Promise<import("./types.js").ConfigDisposition | null>;
  };
}
