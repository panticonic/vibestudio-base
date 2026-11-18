export type AssignedSource = { id: string; path: string };
export type HandoffRequest = {
  goal: string;
  questions: string[];
  sources: AssignedSource[];
};
export type SourceRead = { id: string; lines: string[] };
export type InspectedSources = {
  observed: SourceRead[];
  missing: string[];
};
export type Excerpt = { sourceId: string; firstLine: number; lastLine: number };
export type AnswerEvidence = { question: number; excerpts: Excerpt[] };
export type PreparedHandoff = { body: string | null; unanswered: string[] };
export type ScratchReceipt = { path: string; bytes: number };
export type HandoffReport = {
  status: "staged" | "source-unavailable" | "unanswered" | "unverified";
  artifact: ScratchReceipt | null;
  missingSources: string[];
  unanswered: string[];
};
