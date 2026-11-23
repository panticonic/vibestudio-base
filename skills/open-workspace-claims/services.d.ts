declare module "natlang:services" {
  export const workspaceClaimRead: {
    list():Promise<import("./types.js").ClaimIndex>;
    read(id:string):Promise<import("./types.js").ClaimPacket|null>;
    observe(id:string):Promise<import("./types.js").ClaimEvidence|null>;
  };
  export const workspaceClaimHandoff:{stage(report:import("./types.js").WorkspaceClaimReview):Promise<import("./types.js").ClaimHandoff|null>};
}
