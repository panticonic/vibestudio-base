export type AttemptCard = { id: string; notebook: string; revision: string; title: string };
export type ActionAssignment = {
  notebook: string; title: string; revision: string; goal: string; task: "audit" | "continue" | "retry";
  approval: { notebook: string; revision: string; mode: "continue" | "retry" | "read-only" | "withdrawn" };
  attempts: AttemptCard[];
};
export type ActionEvidence = {
  attempt: AttemptCard; runId: string; runDigest: string; resultDigest: string; terminal: string;
  admitted: boolean; completeEvents: boolean; lastSequence: number; invocationStatus: string;
  failure: { code: string; kind: string; retry: string } | null;
  console: { lines: number; tail: string | null; complete: boolean; sha256: string };
  notebook: { revision: string; saved: boolean; ready: boolean; settledDigest: string; siblingKeys: string[] };
  exactRetry: boolean;
};
export type CapabilityDecision = "hold-ownership" | "hold-revision" | "inspect-only" | "recover-native-evidence" |
  "recover-existing-value" | "report-no-effect" | "hold-cancellation" | "hold-prerequisite" |
  "confirm-continuation" | "retry-exact-step";
export type Continuation = { kind: "confirmed-existing" | "retried-step"; original: string; runId: string; runDigest: string;
  resultDigest: string; valueDigest: string; revision: string };
/** Actual retained notebook text, not a digest standing in for missing content. */
export type RetainedNotebookValue = {
  attempt: AttemptCard;
  runId: string;
  revision: string;
  key: string;
  content: string;
  digest: string;
  /** A later admitted continuation may have updated the same owned scope. */
  observedAfterContinuation: string | null;
};
