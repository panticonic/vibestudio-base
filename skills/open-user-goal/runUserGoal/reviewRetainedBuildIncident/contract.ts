export type IncidentFocus = "build-time" | "initial-payload" | "cache" | "compiler" | "compare" | "runtime-memory";
export type CheckpointCard = {
  id: string;
  label: string;
  source: string;
  owner: string;
  revision: string;
  stateHash: string | null;
  complete: boolean;
  released: boolean;
};
export type IncidentSurvey = {
  subject: { title: string; source: string; owner: string; revision: string };
  checkpoints: CheckpointCard[];
  budgetBytes: number | null;
  localHandoffAllowed: boolean;
};
export type BuildTraceStamp = { startedAt: number; reportDigest: string };
export type NativeBuildDiagnostic = { source: string; file: string; line: number; column: number; message: string };
export type RetainedProfile = {
  checkpoint: CheckpointCard;
  trace: BuildTraceStamp | null;
  diagnostic: NativeBuildDiagnostic | null;
  request: { operationId: string; goal: string; initialBudgetBytes?: number } | null;
};
export type BuildIncidentFinding = "build-time" | "initial-payload" | "cache" | "compiler" | "compare" | "held";
export type BuildIncidentBlocker = "no-approved-current-checkpoint" | "no-comparable-baseline" | "wrong-measurement-boundary" | "native-build-failed";
export type IncidentReceipt = { path: string; bytes: number; sha256: string; checkpoints: string[] };
