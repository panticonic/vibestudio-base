export type CandidateRequest = {
  goal: string;
  intent: "inspect" | "stage";
  sourceUrl: string;
  installedCommit: string;
  incomingCommit: string;
  checkedAfterMs: number;
  commandId: string;
};

export type CandidateOffer = {
  installedCommit: string;
  incomingCommit: string | null;
  checkedAt: number;
  workspaceAppVersion: string;
  currentAppVersion: string;
  targetAppVersion: string | null;
  minimumAppVersion: string | null;
  hostUnavailable: boolean;
  status:
    | "current"
    | "available"
    | "different-epoch"
    | "requires-app-update"
    | "error";
};

export type OfferHold =
  | "discover"
  | "refresh"
  | "current"
  | "target-changed"
  | "discovery-error"
  | "matching-host-required"
  | "app-update-required"
  | "epoch-review-required"
  | "available";
export type OfferDecision = OfferHold | "prepare";

export type CandidateReview = {
  operationId: string;
  contextId: string;
  mainEventId: string;
  incomingCommit: string;
  state: "review" | "published";
  repositories: { repoPath: string; kind: "added" | "changed" | "removed" }[];
  conflicts: {
    repoPath: string;
    deltaId: string;
    kind: "file" | "repository";
    id: string;
  }[];
};
export type StageReceipt =
  | { outcome: "acknowledged"; review: CandidateReview }
  | { outcome: "offer-changed" | "unconfirmed"; review: null };
export type CandidateState = {
  review: CandidateReview;
  mainEventId: string | null;
};
export type ReportStatus =
  | OfferHold
  | "offer-changed"
  | "unconfirmed"
  | "stale-base"
  | "already-published"
  | "resolve-conflicts"
  | "validate-candidate";
export type CandidateReport = {
  status: ReportStatus;
  offer: CandidateOffer | null;
  operationId: string | null;
  candidate: CandidateReview | null;
};
