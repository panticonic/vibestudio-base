import type { ClaimEvidence, ClaimHandoff, ClaimIndex, ClaimPacket, WorkspaceClaimReview } from "./types.js";
declare module "natlang:services" {
  export const workspaceClaimRead: {
    list():Promise<ClaimIndex>;
    read(id:string):Promise<ClaimPacket|null>;
    observe(id:string):Promise<ClaimEvidence|null>;
  };
  export const workspaceClaimHandoff:{stage(report:WorkspaceClaimReview):Promise<ClaimHandoff|null>};
}
