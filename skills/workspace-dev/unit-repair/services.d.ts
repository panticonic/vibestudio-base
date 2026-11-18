declare module "natlang:services" {
  export const unitRepair: {
    observe(): Promise<import("./types.js").Evidence>;
    listSource(revision: string): Promise<string[]>;
    readSource(revision: string, paths: string[]): Promise<import("./types.js").SourceFile[]>;
  };
  export const unitRepairEdit: {
    apply(revision: string, edits: import("./types.js").Edit[]): Promise<{ revision: string }>;
    build(revision: string): Promise<import("./types.js").Evidence>;
    test(revision: string): Promise<import("./types.js").Evidence>;
  };
}
