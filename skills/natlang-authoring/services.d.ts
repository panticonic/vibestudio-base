declare module "natlang:services" {
  export const authoringCompiler: {
    inspect(role: import("./types.js").ProgramRole): Promise<import("./types.js").ProgramReadback>;
  };
}
