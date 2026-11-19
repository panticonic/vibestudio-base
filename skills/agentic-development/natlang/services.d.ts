import type { AgenticSourceObservation } from "./types.js";

declare module "natlang:services" {
  export const agenticChangeSource: {
    read(contextId: string): Promise<AgenticSourceObservation>;
  };
}
