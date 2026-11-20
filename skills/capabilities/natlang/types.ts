export type ExactAuthority = { capability: string; resourceKey: string };
export type AuthorityReviewRequest = {
  goal: string;
  operations: { id: string; label: string }[];
  ceiling: ExactAuthority[];
};
export type AuthorityHostLeaf = ExactAuthority & {
  tier: "open" | "gated" | "critical";
  status: "granted" | "consumable-once" | "acquirable" | "denied";
};
export type AuthorityObservation = {
  operationId: string;
  decision: "allowed" | "acquirable" | "denied";
  leaves: AuthorityHostLeaf[];
};
export type AuthorityDisposition =
  | "eligible"
  | "needs-acquisition"
  | "host-denied"
  | "outside-ceiling";
export type AuthorityOperationReview = {
  observation: AuthorityObservation;
  outside: ExactAuthority[];
  disposition: AuthorityDisposition;
};
export type AuthorityCombined = {
  status: "eligible" | "needs-acquisition" | "held";
  protectedLeaves: ExactAuthority[];
  held: string[];
};
export type AuthorityReview = AuthorityCombined & {
  reviews: AuthorityOperationReview[];
};

export type ApprovalSurface = "workspace" | "hub";
export type ApprovalCaller = "device-workspace" | "device-account" | "linked-agent";
export type ApprovalQueueReceipt = {
  source: ApprovalSurface;
  kind: "acknowledged" | "snapshot" | "unavailable";
  ids: string[];
};
export type ApprovalVisibilityRequest = {
  goal: string;
  caller: ApprovalCaller;
  approvalId: string | null;
  receipts: ApprovalQueueReceipt[];
};
export type ApprovalSurfaceReview = {
  source: ApprovalSurface;
  state: "visible" | "awaiting-snapshot" | "unavailable";
  ids: string[];
};
export type ApprovalVisibility = "complete" | "partial" | "unknown";
export type ApprovalLocation = {
  status: "unassigned" | "located" | "absent" | "unconfirmed";
  source: ApprovalSurface | null;
};
export type ApprovalVisibilityReport = {
  coverage: ApprovalVisibility;
  surfaces: ApprovalSurfaceReview[];
  location: ApprovalLocation;
};
