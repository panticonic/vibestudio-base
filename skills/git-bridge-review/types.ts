export type GitBridgeDirection = "import" | "export" | "diagnose";

export type GitBridgeRequest = {
  operationId: string;
  goal: string;
  repository: string;
  direction: GitBridgeDirection;
};

export type GitBridgeRelationship = "in-sync" | "ahead" | "behind" | "diverged";
export type GitBridgeState =
  | GitBridgeRelationship
  | "integration-required"
  | "auth-failed"
  | "error"
  | "exporting"
  | "pushing"
  | "local-only"
  | "not-materialized"
  | "fetch-failed"
  | "empty";

export type GitBridgeCandidate = { contextId: string; eventId: string };

export type GitBridgeUpstream = {
  state: GitBridgeState;
  remote: string | null;
  branch: string | null;
  autoPush: boolean;
  candidate: GitBridgeCandidate | null;
  observation: null | {
    at: number;
    branchExists: boolean;
    relationship: GitBridgeRelationship | null;
    ahead: number | null;
    behind: number | null;
  };
};

export type GitBridgeSemantic = {
  contextId: string;
  current: boolean;
  mainEventId: string;
  working:
    | { kind: "event"; eventId: string }
    | { kind: "application"; applicationId: string };
  clean: boolean;
  relation: "at" | "ahead" | "behind" | "diverged";
  workingRepositoryId: string | null;
  mainRepositoryId: string | null;
};

export type GitBridgeView = {
  repository: string;
  upstream: GitBridgeUpstream;
  semantic: GitBridgeSemantic;
};

export type GitBridgeFreshness =
  | "observed"
  | "absent"
  | "failed"
  | "in-progress";
export type GitBridgeUpstreamReview = {
  freshness: GitBridgeFreshness;
  consequence: string;
};

export type GitBridgePublicationBasis = {
  state: "protected" | "local-only" | "missing";
  explanation: string;
};

export type GitBridgeCandidateReview = {
  candidate: GitBridgeCandidate | null;
  explanation: string;
};

export type GitBridgeSemanticReview = {
  source: GitBridgePublicationBasis;
  integration: GitBridgeCandidateReview;
};

export type GitBridgeNext =
  | "refresh"
  | "configure-upstream"
  | "verify-semantic-publication"
  | "import-project"
  | "compare-candidate"
  | "preview-pull"
  | "check-credential"
  | "diagnose-observation"
  | "await-transfer"
  | "verify-export"
  | "report";

export type GitBridgeReport = {
  view: GitBridgeView;
  upstreamReview: GitBridgeUpstreamReview | null;
  semanticReview: GitBridgeSemanticReview | null;
  next: GitBridgeNext;
  reason: string;
};
