import type { MemoryBrief, MemoryEvidence, MemoryFile, MemoryKind, MemoryLead, MemoryMessage,
  MemoryNote, MemoryOutcome, MemoryPlan } from "./types.js";

declare module "natlang:services" {
  export const nativeRetainedMemory: {
    brief(): Promise<MemoryBrief>;
    recall(query: string, kinds: MemoryKind[]): Promise<MemoryLead[]>;
    transcript(channelId: string): Promise<MemoryMessage[]>;
    archivedFile(eventId: string): Promise<MemoryFile | null>;
    workingFile(): Promise<MemoryFile | null>;
  };
  export const nativeMemoryHandoff: {
    stage(brief: MemoryBrief, plan: MemoryPlan, evidence: MemoryEvidence, outcome: MemoryOutcome): Promise<MemoryNote | null>;
  };
}
