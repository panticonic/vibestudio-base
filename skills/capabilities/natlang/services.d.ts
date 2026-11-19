import type { AuthorityObservation } from "./types.js";

declare module "natlang:services" {
  export const assignedAuthorityRead: {
    preflight(operationId: string): Promise<AuthorityObservation>;
  };
}
