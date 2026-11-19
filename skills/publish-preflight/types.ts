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
export type PublishVisual = "Checklist" | "Timeline" | "Compare" | "Prose";
export type PublishPreflightReport = {
  status: "ready-for-review" | "blocked" | "waiting" | "verified";
  blockers: PublishBlocker[];
  evidence: string[];
  visual: PublishVisual;
};
