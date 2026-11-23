export type RecordedQuestion = { id: string; goal: string; scope: string };
export type RecordedCandidate = { ref: string; rationale: string | null; tier: string | null; excerpt: string };
export type RecordedSelection = { ref: string | null; blocker: "missing" | "ambiguous" | null };
export type RecordedCohort = { ref: string; paths: { path: string; count: number }[]; complete: boolean };
export type RecordedCounteraction = { path: string; reason: string; attempted: string; ref: string };
export type RecordedEvidence = { cohort: RecordedCohort; withdrawn: RecordedCounteraction[] };
export type RecordedAnswer = { disposition: "supported" | "caution" | "missing" | "ambiguous";
  originalRationale: string | null; affected: string[]; withdrawn: string[]; reasons: string[] };
export type RecordedQuestionReport = RecordedAnswer;
