export type EvalAttemptCard = {
  runId: string;
  role: "prior" | "latest" | "retry";
  label: string;
  authority: "approved" | "withdrawn";
};
export type EvalJobCard = {
  id: string;
  title: string;
  summary: string;
  state: "active" | "archived";
  attempts: EvalAttemptCard[];
};
export type OpenEvalObservation = {
  jobId: string;
  attempt: EvalAttemptCard;
  terminal: "returned" | "failed" | "cancelled";
  runDigest: string;
  resultDigest: string | null;
  exactRetryAuthorized: boolean;
  request: { goal: string; operationId: string };
};
export type OpenEvalReview = {
  runId: string;
  cell: "returned" | "failed";
  journal: "matched" | "absent" | "mismatch" | "incomplete";
  readback: { digest: string; observedDigest: string | null; size: number | null } | null;
  effect: "confirmed" | "missing" | "different" | "unchecked";
  next: string;
  reason: string;
};
export type EvalRecoveryDecision =
  | { action: "use" | "retry"; runId: string }
  | { action: "hold"; reason: "no-confirmed-effect" | "current-result-required" | "source-withdrawn" };
export type EvalTrial = { observation: OpenEvalObservation; review: OpenEvalReview };
export type EvalHandoffArtifact = { path: string; bytes: number; sha256: string; runId: string };
export type EvalHandoffGoalReport =
  | { status: "unresolved"; reason: "job-unavailable" }
  | { status: "reviewed"; jobId: string; trials: EvalTrial[]; decision: EvalRecoveryDecision; artifact: EvalHandoffArtifact | null };
