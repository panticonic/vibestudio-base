export type RecordedQuestion = { id: string; goal: string; scope: string };
export type RecordedCandidate = { ref: string; rationale: string | null; tier: string | null; excerpt: string };
export type RecordedSelection = { ref: string | null; blocker: "missing" | "ambiguous" | null };
export type RecordedCohort = { ref: string; paths: { path: string; count: number }[]; complete: boolean };
/** Already scoped by the native query to the selected proposal; this reference names the counteraction itself. */
export type RecordedCounteraction = { path: string; reason: string; attempted: string; counteractionRef: string };
export type RecordedEvidence = { cohort: RecordedCohort | null; withdrawn: RecordedCounteraction[] | null };
/** The requested user-facing conclusion; native references and records stay in scoped evidence APIs. */
export type RecordedQuestionFindings = { answer: string };
