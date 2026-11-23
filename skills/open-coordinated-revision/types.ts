export type RevisionFile = { path: string; version: string; text: string; fileId: string };
export type RevisionScope = { subject: string; head: string; files: RevisionFile[] };
export type RevisionAuthority = { required: string[]; observed: string[]; supported: string[]; missing: string[] };
export type RevisionDraft = { path: string; version: string; text: string };
export type RevisionPlan = { status: "ready" | "held" | "already-aligned"; destinations: RevisionDraft[]; explanation: string };
export type RevisionReceipt = {
  status: "changed" | "applied" | "unavailable"; head: string; paths: string[];
};
export type RevisionReadback = {
  head: string; protectedMain: string; files: RevisionFile[];
};
export type CoordinatedRevisionReport = {
  initial: RevisionScope; initialAuthority: RevisionAuthority; plan: RevisionPlan; first: RevisionReceipt | null;
  updated: RevisionScope | null; updatedAuthority: RevisionAuthority | null; reconciled: RevisionPlan | null;
  final: RevisionReceipt | null; readback: RevisionReadback;
};

export type CoordinatedRevisionResult = { status: RevisionPlan["status"]; head: string; documents: {path:string;version:string}[]; explanation:string };
