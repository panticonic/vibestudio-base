declare module "natlang:services" {
  export const ownedSpecialistIndex: { list(): Promise<import("./types.js").SpecialistIndex> };
  export const ownedSpecialistRun: { read(channelId: string): Promise<import("./types.js").SpecialistSnapshot | null> };
  export const ownedSpecialistArtifact: { read(channelId: string, resultMessage: string): Promise<import("./types.js").OriginalArtifact | null> };
  export const ownedSpecialistHandoff: { stage(plan: import("./types.js").SpecialistPlan, history: import("./types.js").HistoryReview): Promise<import("./types.js").IntegrationArtifact | null> };
}
