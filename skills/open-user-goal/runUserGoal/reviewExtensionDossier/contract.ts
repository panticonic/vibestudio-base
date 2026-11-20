export type ReviewOwner = {
  name: string;
  source: string;
  candidateTree: string | null;
  grant: "inspect" | "local-verification" | "local-rollback-dossier" | "withdrawn" | "publish";
  retainedBuild: string | null;
};
export type ManifestDelta = {
  workingDigest: string | null;
  publishedDigest: string | null;
  candidateValidationError: string | null;
  activation: { working: string[]; published: string[] };
  dependencyChanges: string[];
  methodChanges: { method: string; change: "added" | "removed" | "changed"; accessExpansion: boolean }[];
  capabilityChanges: string[];
  expandedCapabilities: boolean;
};
export type RetainedBuild = { buildKey: string; effectiveVersion: string | null; version: string };
export type ReleaseHistory = {
  current: RetainedBuild | null;
  previous: RetainedBuild[];
  retentionLimit: number;
  requested: RetainedBuild | null;
  requestedBuildVerified: boolean;
  receiverMatches: boolean;
};
export type DossierDecision =
  | "stale-owner-scope" | "outside-local-scope" | "candidate-incompatible" | "authority-review-required"
  | "verify-local-candidate" | "release-evidence-conflict" | "wait-for-release" | "record-current-comparison"
  | "rollback-not-retained" | "record-retained-rollback";
export type DossierReceipt = { path: string; bytes: number; sha256: string };
export type DossierAssignment = {
  request: { goal: string; operationId: string; method: string };
  owner: ReviewOwner;
  purpose: "comparison" | "verification" | "rollback";
};
