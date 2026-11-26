export type MemoryBrief = { subject: string; channelId: string; repository: string };
export type MemoryKind = "message" | "file" | "commit";
export type MemoryPlan = { query: string; kinds: MemoryKind[]; readTranscript: boolean; readWorking: boolean };
export type MemoryLead = {
  kind: MemoryKind; snippet: string; eventId: string; logId: string | null; head: string | null;
  path: string | null; digest: string | null;
};
export type MemoryMessage = {
  channelId: string; envelopeId: string; messageId: string; sender: string; sequence: number; text: string;
};
export type MemoryFile = { eventId: string; fileId: string; path: string; digest: string; text: string };
export type MemoryEvidence = {
  leads: MemoryLead[]; messages: MemoryMessage[]; committed: MemoryFile[]; working: MemoryFile | null;
};
export type MemoryCitation = { layer: "message" | "commit" | "working"; ref: string; coordinate: string; quote: string };
export type MemoryOutcome = {
  disposition: string;
  citations: MemoryCitation[]; summary: string;
};
export type MemoryNote = { path: string; digest: string };
export type RetainedMemoryReport = {
  brief: MemoryBrief; plan: MemoryPlan; evidence: MemoryEvidence; outcome: MemoryOutcome; handoff: MemoryNote | null;
};

export type MemoryResult = {outcome:MemoryOutcome;handoff:MemoryNote|null};

/** Reader capabilities for the owned originals; no artifact writer is exposed. */
export type MemoryReaders = {
  recall: (query:string,kinds:MemoryKind[])=>Promise<MemoryLead[]>;
  transcript: (channelId:string)=>Promise<MemoryMessage[]>;
  archivedFile: (eventId:string)=>Promise<MemoryFile|null>;
  workingFile: ()=>Promise<MemoryFile|null>;
};
export type MemoryInvestigation = {plan:MemoryPlan;evidence:MemoryEvidence};
