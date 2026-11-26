export type EvalAssignment = {
  id: string; goal: string; subject: string; request: string; revision: string;
  mayNarrow: boolean; mayUseCheckpoint: boolean; mayUseWindow: boolean;
};
export type EvalUsefulResult = { request: string; revision: string; count: number; detail: string };
export type EvalCandidate = { request: string; revision: string; complete: boolean; digest: string };
export type EvalCellEvidence = {
  runId: string; scopeId: string; status: "unadmitted" | "failed" | "timed-out" | "completed";
  runDigest: string | null; failureCode: string | null; diagnostic: string | null; returnKind: "none" | "compact" | "window";
  checkpoint: EvalCandidate | null; window: EvalCandidate | null; compact: EvalCandidate | null;
};
export type EvalPick = {
  decision: "checkpoint" | "window" | "narrow" | "compact" | "held";
  reason: "complete-checkpoint" | "complete-window" | "clean-return" | "bounded-retry" |
    "partial-checkpoint" | "stale-checkpoint" | "stale-window" | "no-authorized-result";
};
export type EvalRecoveryReceipt = { observation: EvalUsefulResult; scopeId: string; resultDigest: string; recoveryRun: string | null; pages: number };
export type SameTurnFindings = { explanation:string; result:EvalUsefulResult|null };
