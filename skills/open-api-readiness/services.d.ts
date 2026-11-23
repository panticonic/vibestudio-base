declare module "natlang:services" {
  export const quietIntegrationIndex: { list(): Promise<import("./types.js").IntegrationIndex> };
  export const quietIntegrationJournal: { read(channelId:string): Promise<import("./types.js").SelectionFrontier|null> };
  export const quietIntegrationProtocol: {
    open(profileId:string,message:string):Promise<import("./types.js").QuietRequest|null>;
    audit(operationId:string):Promise<import("./types.js").QuietAudit|null>;
  };
  export const quietIntegrationHandoff: { stage(report:import("./types.js").ReadinessReport):Promise<import("./types.js").ReadinessArtifact|null> };
}
