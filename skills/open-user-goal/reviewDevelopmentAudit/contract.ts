export type DevelopmentAssignment = {
  goal: string; project: string; session: string; requested: string;
  alternate: string; allowAlternate: boolean; approval: string | null; permission: "review" | "review-and-keep";
};
export type DevelopmentJournalEntry = {
  sequence: number; at: number; kind: string; code: string | null; snapshot: string | null;
};
export type DevelopmentObservation = {
  id: string; session: string; sessionState: string; contextEffect: string; snapshot: string;
  snapshotMatchesSession: boolean; planMatches: boolean; state: string; commitPoint: string;
  updatedAt: number; terminalAt: number | null; attention: string | null; primary: string | null;
  phase: string | null; artifactDigest: string | null; instanceGeneration: string | null;
  cleanup: string[]; executionRoot: string | null; process: string | null; artifact: string | null;
  journal: DevelopmentJournalEntry[];
};
export type DevelopmentPair = { requested: DevelopmentObservation | null; alternate: DevelopmentObservation | null };
export type DevelopmentChoice = { runId: string | null; blocker: null | "hold-no-owned-run" | "hold-wrong-session" | "hold-stale-approval" };
export type DevelopmentDisposition =
  "keep-repair" | "already-kept" | "report-only" | "report-complete" | "report-cancelled" |
  "hold-no-owned-run" | "hold-wrong-session" | "hold-stale-approval" | "hold-active" |
  "hold-context" | "hold-checkpoint" | "hold-journal" | "hold-process" | "hold-effects";
export type DevelopmentAssessment = { disposition: DevelopmentDisposition; decisiveSequences: number[] };
export type DevelopmentKeepReceipt = { runId: string; snapshot: string; updatedAt: number; sequence: number; attention: "kept" };
export type DevelopmentAuditFindings = { runId: string | null; assessment: DevelopmentAssessment; receipt: DevelopmentKeepReceipt | null };
