import type { DictationArtifact, DictationPlan, DictationSnapshot, DictationThread, DraftReview } from "./types.js";
export declare const retainedDictationIndex: { list(): Promise<DictationThread[]> };
export declare const retainedDictationState: { read(threadId: string): Promise<DictationSnapshot | null> };
export declare const retainedDictationHandoff: { stage(plan: DictationPlan, review: DraftReview): Promise<DictationArtifact | null> };
