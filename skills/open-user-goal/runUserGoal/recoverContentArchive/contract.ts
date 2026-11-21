export type ContentArchiveAssignment = {
  id: string; goal: string; project: string; repository: string; edition: string;
  primary: string; previous: string; previousAllowed: boolean; manifestDigest: string;
  paths: string[]; permitted: string[];
  approval: { repository: string; workingRevision: string; mode: "local" | "inspect" };
};
export type ContentArchiveFile = { path: string; digest: string; mode: number };
export type ContentArchiveEdition = {
  ref: string; available: boolean; rootTreeHash: string | null; edition: string | null;
  repository: string | null; manifestDigest: string | null; files: ContentArchiveFile[];
  coherent: boolean;
};
export type ContentArchiveWorkingFile = {
  path: string; fileId: string | null; digest: string | null; mode: number | null;
  state: "current" | "old" | "missing" | "coedit" | "collision" | "mode";
};
export type ContentArchiveObservation = {
  workingRevision: string; mainRevision: string; repository: string;
  primary: ContentArchiveEdition; previous: ContentArchiveEdition; working: ContentArchiveWorkingFile[];
};
export type ContentArchiveChoice = { ref: string | null; reason: string };
export type ContentArchivePlan = {
  action: "restore" | "keep-current" | "inspect-only" | "hold-archive" | "hold-collision" |
    "hold-coedit" | "hold-scope" | "hold-revision";
  paths: string[]; reason: string;
};
export type ContentArchiveReceipt = {
  status: "restored" | "state-changed";
  workingRevision: string; application: { id: string; changes: string[] } | null;
  files: ContentArchiveWorkingFile[];
};
export type ContentArchiveOutcome = {
  assignment: ContentArchiveAssignment; observation: ContentArchiveObservation; archive: ContentArchiveChoice;
  plan: ContentArchivePlan; receipt: ContentArchiveReceipt | null;
};
