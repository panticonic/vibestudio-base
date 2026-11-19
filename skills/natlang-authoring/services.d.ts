import type { ProgramReadback, ProgramRole } from "./types.js";
declare module "natlang:services" {
  export const authoringCompiler: {
    inspect(role: ProgramRole): Promise<ProgramReadback>;
  };
}
