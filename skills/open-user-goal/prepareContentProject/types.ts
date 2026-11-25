export type ProjectSourceDocument = {
  id: string;
  path: string;
  fileId: string;
  digest: string;
  edition: "current" | "retired";
  purpose: "requirements" | "safety" | "approval";
  facts: { id: string; text: string }[];
  localApproval: "commit" | "draft" | "pending" | null;
};
export type ProjectEvidenceReview = {
  title: string;
  repoPath: string;
  audience: string;
  documentRoles: string[];
  revision: string;
  occupied: boolean;
  records: ProjectSourceDocument[];
};
export type ProjectCitation = { source: string; digest: string; fact: string };
export type ProjectEvidenceDecision = {
  action: "commit" | "draft" | "hold";
  basis: "authorized" | "occupied" | "missing" | "conflict" | "pending";
  selected: ProjectCitation[];
  reason: string;
};
export type ReviewedProjectEvidence = {
  evidence: ProjectEvidenceReview;
  decision: ProjectEvidenceDecision;
};
export type ApprovedProjectRequest = {
  goal: string;
  audience: string;
  facts: {id:string; text:string}[];
  documentRoles: string[];
};
export type ProjectScopeLease = {
  status: "admitted" | "held" | "moved";
  receipt: string | null;
  initialHead: string;
  request: ApprovedProjectRequest | null;
};
export type PreparedContentSnapshot = {
  contextId: string;
  repoPath: string;
  repositoryId: string | null;
  head: string;
  mainEventId: string;
  committedEventId: string;
  clean: boolean;
  files: {path:string; text:string}[];
};
export type AuthoredProjectDraft = {
  snapshot: PreparedContentSnapshot;
  review: {ready:boolean; coveredRoles:string[]; unsupportedClaims:string[]; blockers:string[]; reason:string};
} | null;
export type PrivateProjectFinish = {
  outcome: "committed" | "draft" | "held" | "held-moved" | "review-needed";
  candidate: PreparedContentSnapshot | null;
  event: {eventId:string; head:string} | null;
};
export type ContentProjectResult = {
  outcome: "committed"|"draft"|"held"|"held-moved"|"review-needed";
  project: {contextId:string; repositoryId:string|null; repoPath:string; head:string; documents:string[]} | null;
  event: {eventId:string;head:string} | null;
};

/** Semantic choices use local handles; native binding owns opaque identities. */
export type ProjectDispositionEvidence = {
 title:string; audience:string; documentRoles:string[]; occupied:boolean;
 records:{edition:"current"|"retired";purpose:"requirements"|"safety"|"approval";localApproval:"commit"|"draft"|"pending"|null;facts:{handle:number;text:string}[]}[];
};
export type ProjectDispositionChoice = {action:"commit"|"draft"|"hold";basis:"authorized"|"occupied"|"missing"|"conflict"|"pending";selected:number[];reason:string};
