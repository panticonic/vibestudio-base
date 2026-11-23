declare module "natlang:services" {
  export const reconciliationArchive: {
    list(): Promise<import("./types.js").ArchiveCard[]>;
    read(id: string): Promise<import("./types.js").ArchiveSnapshot | null>;
    readCurrent(id: string, head: string): Promise<import("./types.js").CurrentArchiveValue | null>;
  };
  export const reconciliationWindow: {
    read(): Promise<import("./types.js").ReviewWindow>;
    release(head: string): Promise<import("./types.js").EvidenceRequest | null>;
  };
  export const reconciliationNative: {
    observe(): Promise<import("./types.js").ReconcileView>;
    apply(head: string, edits: import("./types.js").ReconcileEdit[]): Promise<import("./types.js").ReconcileEffect>;
    merge(head: string, decisions: import("./types.js").ReconcileDecision[]): Promise<import("./types.js").ReconcileEffect>;
  };
}
