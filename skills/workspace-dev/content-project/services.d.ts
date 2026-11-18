declare module "natlang:services" {
  export const projectWorkspace: { observe(): Promise<import("./types.js").Snapshot> };
  export const projectWorkspaceEdit: {
    prepare(head: string): Promise<import("./types.js").Snapshot>;
    writeDocuments(head: string, documents: import("./types.js").Draft[]): Promise<import("./types.js").Snapshot>;
    commit(head: string, message: string): Promise<{eventId: string;head: string}>;
  };
}
