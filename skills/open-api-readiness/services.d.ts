import type { IntegrationIndex, QuietAudit, QuietRequest, ReadinessArtifact, ReadinessReport, SelectionFrontier } from "./types.js";

declare module "natlang:services" {
  export const quietIntegrationIndex: { list(): Promise<IntegrationIndex> };
  export const quietIntegrationJournal: { read(channelId:string): Promise<SelectionFrontier|null> };
  export const quietIntegrationProtocol: {
    open(profileId:string,message:string):Promise<QuietRequest|null>;
    audit(operationId:string):Promise<QuietAudit|null>;
  };
  export const quietIntegrationHandoff: { stage(report:ReadinessReport):Promise<ReadinessArtifact|null> };
}
