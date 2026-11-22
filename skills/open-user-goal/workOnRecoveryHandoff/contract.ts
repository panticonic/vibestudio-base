export type RecoveryHandoffDirective = {
  revision: number;
  recipient: string;
  disposition: "requested" | "cancelled" | "review-only";
  questions: string[];
};
export type RecoveryHandoffRequest = { goal: string; questions: string[]; sources: { id: string; path: string }[] };
export type RecoveryHandoffInput = { directive: RecoveryHandoffDirective; request: RecoveryHandoffRequest | null };
export type RecoveryScratchStatus = "staged" | "source-unavailable" | "unanswered" | "unverified";
