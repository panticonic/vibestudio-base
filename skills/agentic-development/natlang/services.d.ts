declare module "natlang:services" {
  export const agenticChangeSource: {
    read(contextId: string): Promise<import("./types.js").AgenticSourceObservation>;
  };
}
