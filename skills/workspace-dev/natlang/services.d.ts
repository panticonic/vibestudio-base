declare module "natlang:services" {
  export const unitIdentity: {
    /** Read the assigned unit at the caller's current working head. */
    observe(operationId: string): Promise<import("./types.js").UnitIdentityObservation>;
    /** Resolve a catalog intent to canonical artwork and a manifest declaration. */
    resolve(operationId: string, intent: import("./types.js").IconIntent): Promise<import("./types.js").UnitIdentityCandidate | null>;
    /** Prepare and check the exact resolved icon in the assigned working state. */
    stage(operationId: string, revision: string, authoringId: string): Promise<import("./types.js").UnitIdentityChange>;
  };
}
