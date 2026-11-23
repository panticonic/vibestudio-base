export type PtyCursor = { epoch: number; cursor: number };
export type PtyCheck = { sessionId: string; pid: number; contextId: string; checkpoint: PtyCursor; digest: string; needsReturnCode: boolean };
export type PtyAssignment = {
  goal: string; subject: string; nominated: PtyCheck; alternative: PtyCheck; allowAlternative: boolean; mayStage: boolean;
};
export type PtyObservation = {
  sessionId: string; pid: number; contextId: string; alive: boolean; epoch: number; start: number; end: number;
  cursorState: "continued" | "gap" | "reset"; replayStart: number; replayBytes: number; replayDigest: string;
  replayPreview: string | null; retainedDigest: string; retainedBytes: number; byteAgreement: boolean; exit: { code: number | null; signal: string | null } | null;
};
export type PtyPair = { nominated: PtyObservation | null; alternative: PtyObservation | null };
export type PtyBlocker = "hold-no-session" | "hold-context" | "hold-generation";
export type PtyChoice = { sessionId: string | null; blocker: PtyBlocker | null };
export type PtyDisposition = PtyBlocker | "hold-running" | "hold-gap" | "hold-reset" | "hold-proof" | "report-failed" | "report-signal" | "report-good" | "stage-good";
export type PtyDecision = { disposition: PtyDisposition; replayDigest: string | null; exitCode: number | null };
export type PtyReceipt = { path: string; bytes: number; sha256: string };
export type PtyContinuityOutcome = { decision: PtyDecision; receipt: PtyReceipt | null };
