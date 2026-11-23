declare module "natlang:services" {
  export const assignedAuthorityRead: {
    preflight(operationId: string): Promise<import("./types.js").AuthorityObservation>;
  };
}
