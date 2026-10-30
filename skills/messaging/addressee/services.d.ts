declare module "natlang:services" {
  /** Who the agent can message in its conversation. Read-only; sending stays with the notify tool. */
  export const addressees: {
    list(): Promise<import("./types.js").AddresseeRow[]>;
  };
}
