declare module "natlang:services" {
  export const recoverySessions: {
    discover(): Promise<import("./types.js").RecoverySource[]>;
  };
  export const recoveryReplay: {
    resume(id: string): Promise<import("./types.js").RecoveryWindow>;
  };
  export const recoveryHandoff: {
    stage(review: import("./types.js").RecoveryFinding): Promise<import("./types.js").RecoveryArtifact>;
  };
}
