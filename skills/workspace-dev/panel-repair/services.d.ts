declare module "natlang:services" {
  export const panelRepair: {
    observe(): Promise<import("./types.js").Observation>;
    interact(
      generation: string,
      interaction: import("./types.js").Interaction,
    ): Promise<{ observations: import("./types.js").InteractionObservation[] }>;
    listSource(revision: string): Promise<string[]>;
    readSource(revision: string, paths: string[]): Promise<import("./types.js").SourceFile[]>;
    apply(revision: string, edits: import("./types.js").Edit[]): Promise<{ revision: string }>;
    build(revision: string): Promise<import("./types.js").Build>;
    rebuild(revision: string): Promise<import("./types.js").Observation>;
  };
}
