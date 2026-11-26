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


/** Requested semantic answer and authentic current document values, without operational report echoes. */
export type CoordinatedRevisionFindings = {answer:string|null;documents:RevisionFile[]};
