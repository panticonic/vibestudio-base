import type { HistoryReview, IntegrationArtifact, OriginalArtifact, SpecialistIndex, SpecialistPlan, SpecialistSnapshot } from "./types.js";

declare module "natlang:services" {
  export const ownedSpecialistIndex: { list(): Promise<SpecialistIndex> };
  export const ownedSpecialistRun: { read(channelId: string): Promise<SpecialistSnapshot | null> };
  export const ownedSpecialistArtifact: { read(channelId: string, resultMessage: string): Promise<OriginalArtifact | null> };
  export const ownedSpecialistHandoff: { stage(plan: SpecialistPlan, history: HistoryReview): Promise<IntegrationArtifact | null> };
}
