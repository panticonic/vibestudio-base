export type PublishEnvironment = "preview" | "production";
export type PublishIntent = {
  provider: string;
  destination: string;
  environment: PublishEnvironment;
};
export type WebsiteArtifactObservation = {
  referenceMatches: boolean;
  manifestMatches: boolean;
  hasHtml: boolean;
  unapprovedFiles: string[];
  publicFiles: number;
  artifactDigest: string;
};
export type PresentationObservation = {
  matchesPanelAttempt: boolean;
  missedProbes: string[];
  observedProbes: string[];
};
export type PublicationObservation = {
  phase: "prepared" | "destination-ready" | "uploaded" | "submitted";
  matchesIntent: boolean;
  matchesArtifact: boolean;
  matchesOperation: boolean;
  observedReadyUrl: boolean;
  verifiedPublicDigest: boolean;
};
export type WebsiteReviewObservation = {
  artifact: WebsiteArtifactObservation;
  presentation: PresentationObservation;
  publication: PublicationObservation | null;
  matchesRequest: boolean;
};
export type PublishPreflightRequest = {
  goal: string;
  action: "prepare" | "check-existing";
  audience: string;
  intendedDestination: PublishIntent;
};
export type PublishBlocker =
  | "different-request"
  | "source-reference"
  | "public-manifest"
  | "public-paths"
  | "html-entry"
  | "stale-panel"
  | "missing-presentation"
  | "different-publication"
  | "missing-publication"
  | "awaiting-provider"
  | "verify-public";
export type PreflightReview = {
  blockers: PublishBlocker[];
  evidence: string[];
};
export type PublicationNext =
  | "hold-review"
  | "recover-receipt"
  | "resume-operation"
  | "watch-provider"
  | "verify-public"
  | "complete";
export type PublicationProgressReview = PreflightReview & { next?: PublicationNext };
export type PublishVisual = "Checklist" | "Timeline" | "Compare" | "Prose";
export type PublishPreflightReport = {
  status: "ready-for-review" | "blocked" | "waiting" | "verified";
  blockers: PublishBlocker[];
  evidence: string[];
  visual: PublishVisual;
  next?: PublicationNext;
};

export type PublicationRevisionRequest = { goal: string; operationId: string };

export type PublicRevisionFile = {
  path: string;
  digest: string;
  bytes: number;
};

export type PublicationRevisionPackage = {
  sourceHash: string;
  artifactDigest: string;
  entry: string;
  intent: PublishIntent;
  files: PublicRevisionFile[];
};

export type PublicationRevisionComparison = {
  source: string;
  reviewed: PublicationRevisionPackage;
  candidate: PublicationRevisionPackage;
  change: {
    added: PublicRevisionFile[];
    removed: PublicRevisionFile[];
    modified: { before: PublicRevisionFile; after: PublicRevisionFile }[];
  };
};

export type PublicationRevisionImpact = {
  entryChanged: boolean;
  htmlChanged: boolean;
  manifestChanged: boolean;
  affectedPaths: string[];
};

export type PublicationRevisionReport = {
  comparison: PublicationRevisionComparison;
  match: "same-target" | "different-target";
  impact: PublicationRevisionImpact;
  decision: "keep-review" | "review-public-change" | "review-target";
  reason: string;
};
