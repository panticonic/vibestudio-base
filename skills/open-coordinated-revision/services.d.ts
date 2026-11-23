declare module "natlang:services" {
  export const nativeCoordinatedRevision: {
    discover(): Promise<import("./types.js").RevisionScope>;
    revise(head: string, drafts: import("./types.js").RevisionDraft[]): Promise<import("./types.js").RevisionReceipt>;
    readback(): Promise<import("./types.js").RevisionReadback>;
  };
}
