declare module "natlang:services" {
  export const nativeRetainedMemory: {
    brief(): Promise<import("./types.js").MemoryBrief>;
    recall(query: string, kinds: import("./types.js").MemoryKind[]): Promise<import("./types.js").MemoryLead[]>;
    transcript(channelId: string): Promise<import("./types.js").MemoryMessage[]>;
    archivedFile(eventId: string): Promise<import("./types.js").MemoryFile | null>;
    workingFile(): Promise<import("./types.js").MemoryFile | null>;
  };
  export const nativeMemoryHandoff: {
    stage(brief: import("./types.js").MemoryBrief, plan: import("./types.js").MemoryPlan, evidence: import("./types.js").MemoryEvidence, outcome: import("./types.js").MemoryOutcome): Promise<import("./types.js").MemoryNote | null>;
  };
}
