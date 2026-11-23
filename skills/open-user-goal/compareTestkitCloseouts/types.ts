export type CloseoutAttempt = { label: string; receipt: string };
export type CloseoutPair = { current: CloseoutAttempt; prior: CloseoutAttempt };
export type CloseoutEvidence = {
  receipt: string;
  testOutcome: "passed" | "failed" | "errored" | "timeout";
  release: { decision: "confirmed" | "waiting" | "revise" | "unobserved"; finding: string; evidenceIds: string[] };
  inventory: "clear" | "registered-residue" | "unregistered-residue" | "mixed-residue";
  remainingIds: string[];
};
export type CloseoutDecision = {
  status: "cleared" | "hold-test" | "hold-residue" | "hold-ack";
  currentRemaining: string[];
  note: boolean;
  explanation: string;
};
export type CloseoutReceipt = { path: string; sha256: string; bytes: number };
export type CloseoutReport = {decision: CloseoutDecision; handoff: CloseoutReceipt | null};
