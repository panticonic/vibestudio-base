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
