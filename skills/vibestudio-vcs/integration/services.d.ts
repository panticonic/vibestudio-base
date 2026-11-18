declare module "natlang:services" {
  export const workspaceIntegration: {
    observe(): Promise<import("./types.js").Snapshot>;
    apply(head: string, edits: import("./types.js").Edit[]): Promise<{head: string}>;
    merge(head: string, decisions: import("./types.js").Decision[]): Promise<{head: string}>;
  };
}
