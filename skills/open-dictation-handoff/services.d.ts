import type { DictationArtifact, DictationPlan, DictationSnapshot, DictationThread, DraftReview } from "./types.js";

declare module "natlang:services" {
  export const retainedDictationIndex: { list(): Promise<DictationThread[]> };
  export const retainedDictationState: { read(threadId: string): Promise<DictationSnapshot | null> };
  export const retainedDictationHandoff: { stage(plan: DictationPlan, review: DraftReview): Promise<DictationArtifact | null> };
}
