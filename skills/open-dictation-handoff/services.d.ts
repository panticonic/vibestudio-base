declare module "natlang:services" {
  export const retainedDictationIndex: { list(): Promise<import("./types.js").DictationThread[]> };
  export const retainedDictationState: { read(threadId: string): Promise<import("./types.js").DictationSnapshot | null> };
  export const retainedDictationHandoff: { stage(plan: import("./types.js").DictationPlan, review: import("./types.js").DraftReview): Promise<import("./types.js").DictationArtifact | null> };
}
