export type EvalRecoveryRequest = { operationId: string; goal: string };
export type EvalRecoveryStore = { digest: string; contentDigest: string; size: number };
export type EvalRecoveryAttempt = {
  operationId: string;
  runId: string;
  cell: "returned" | "failed";
  journal: "complete" | "truncated" | "unavailable";
  expectedDigest: string;
  expectedSize: number;
  allowReadback: boolean;
  stores: EvalRecoveryStore[];
};
export type EvalRecoveryJournalFinding = "matched" | "absent" | "mismatch" | "incomplete";
export type EvalRecoveryEffect = "confirmed" | "missing" | "different" | "unchecked";
export type EvalRecoveryReadback = {
  digest: string;
  observedDigest: string | null;
  size: number | null;
};
export type EvalRecoveryNext =
  | "continue-with-effect"
  | "confirm-effect"
  | "inspect-integrity"
  | "recover-journal"
  | "inspect-original-attempt";
export type EvalRecoveryReport = {
  runId: string;
  cell: EvalRecoveryAttempt["cell"];
  journal: EvalRecoveryJournalFinding;
  readback: EvalRecoveryReadback | null;
  effect: EvalRecoveryEffect;
  next: EvalRecoveryNext;
  reason: string;
};
