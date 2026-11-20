declare module "natlang:services" {
  export const goalDiscovery: {
    search(queries: string[]): Promise<import("./types.js").GoalSearchResult[]>;
    snapshotTime(): number;
  };
  export const goalWorkspace: {
    list(): Promise<string[]>;
    read(path: string): Promise<import("./types.js").WorkspaceRevision | null>;
    revise(path: string, version: string, text: string): Promise<import("./types.js").WorkspaceWrite>;
  };
}
