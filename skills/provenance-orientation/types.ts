/** The mechanism that answers a question about why tracked state is the way it is. */
export type ProvenanceMechanism =
  | "attached-read"
  | "cause"
  | "cohort"
  | "relate"
  | "blame"
  | "rejections"
  | "search"
  | "memory-recall"
  | "query"
  | "direct-edges";

export type ProvenanceOrigin =
  | "managed-edit"
  | "copy"
  | "merge"
  | "external-import";
export type ReasonTier = "stated" | "trigger" | "mechanical";
export type ProvenanceRefusal =
  | "too-broad"
  | "outside-visibility"
  | "pruned"
  | "none";
export type ProvenanceFact = {
  ref: string;
  kind: "cause" | "cohort" | "rejection" | "note" | "history";
  summary: string;
  tier: ReasonTier;
  disclosed: boolean;
};
export type AttributionReceipt = {
  origin: ProvenanceOrigin;
  actor: string | null;
  sourceRef: string | null;
  sourceRevision: string | null;
  decisionRef: string | null;
  actionRef: string;
  statedIntentRef: string | null;
  visibleBoundary: string | null;
};
export type ConstraintQuestion = {
  kind: "constraint";
  goal: string;
  proposedProperty: string;
  evidence: ProvenanceFact[];
  boundary: ProvenanceRefusal;
};
export type HistoryWalk = "cause" | "cohort" | "rejections";
export type HistoryCheck = { path: string; walk: HistoryWalk; scope: "work-unit" | "turn" };
export type HistoryReceipt = {
  check: HistoryCheck;
  exists: boolean;
  limited: boolean;
  records: { ref: string; label: string; intent: string | null; tier: string | null; group: string | null; boundary: string | null }[];
};
export type HistoryFinding = {
  check: HistoryCheck;
  status: "coordinate-absent" | "limited" | "recorded" | "none-visible";
  evidence: string[];
};
export type HistoryRequest = { kind: "live-history"; goal: string; checks: HistoryCheck[] };
export type ProvenanceRequest =
  | HistoryRequest
  | {
      kind: "route";
      goal: string;
      memoryInstalled: boolean;
      attachedReadSufficient: boolean;
    }
  | { kind: "attribution"; goal: string; receipt: AttributionReceipt }
  | ConstraintQuestion;
export type EvidenceVote = {
  supports: string[];
  conflicts: string[];
  historicAssumptions: string[];
  currentRejections: string[];
};
export type ProvenanceReport =
  | { kind: "live-history"; findings: HistoryFinding[] }
  | { kind: "route"; mechanism: ProvenanceMechanism }
  | {
      kind: "attribution";
      origin: ProvenanceOrigin;
      references: string[];
      supportedIntent: string | null;
      boundary: string | null;
    }
  | {
      kind: "constraint";
      status: "supported" | "rejected" | "inconclusive" | "narrow-scope";
      evidence: string[];
    };
