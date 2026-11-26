export type ReleaseAssignment = {
  id: string;
  goal: string;
  subject: string;
  contextId: string;
  buildKey: string;
  effectiveVersion: string;
  current: string;
  earlier: string;
  required: string[];
  allowEarlier: boolean;
  grant: "both" | "accept-only" | "diagnose-only" | "read";
};
export type RunEvidence = {
  id: string;
  context: "same" | "other" | "unavailable";
  status: "running" | "completed" | "cancelled" | "errored" | "missing";
  terminalSaved: boolean;
  buildKey: string | null;
  effectiveVersion: string | null;
  declared: string[];
  unavailable: string[];
  total: number;
};
export type RetainedRunPair = { current: RunEvidence; earlier: RunEvidence };
export type RunChoice = {
  runId: string | null;
  blocker: "hold-context" | "hold-build" | "hold-active" | "hold-cancelled" | "hold-missing-run" | null;
};
export type CaseEvidence = {
  name: string; digest: string | null; rank: "retained" | "missing" | "not-installed";
  passed: boolean | null; exactWitness: boolean;
  primary: { kind: "runtime" | "delivery" | "validator" | "assertion" | "unexpected-tool"; code: string; detail: string } | null;
  cleanup: string[]; expectedToolFailures: string[];
};
export type ReleaseAssessment = {
  disposition: "stage-acceptance" | "stage-diagnostics" | "report-only" | "hold-context" | "hold-build" |
    "hold-active" | "hold-cancelled" | "hold-missing-run" | "hold-evidence" | "hold-failure" | "hold-cleanup";
  reason: string;
  decisive: string[];
};
export type ReleaseReceipt = { path: string; bytes: number; sha256: string };
export type SystemReleaseOutcome = string;
