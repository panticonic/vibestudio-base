export type ReviewKind = "pdf" | "speech" | "git";
export type PdfPage = {
  pageNumber: number;
  extractionMethod: "embedded-text" | "ocr" | "mixed" | "none";
  lines: {
    text: string;
    bbox: number[];
    confidence: number | null;
    source: "ocr" | "embedded-text";
  }[];
  imageArtifactId: string | null;
  warnings: string[];
};
export type PdfEvidence = {
  id: string;
  digest: string;
  pageCount: number;
  encrypted: boolean;
  selectedPages: number[];
  pages: PdfPage[];
  engines: { id: string; available: boolean; bundled: boolean }[];
};
export type PdfReview = {
  digest: string;
  requestedPages: number[];
  need: "text" | "structure" | "ocr" | "image";
  minimumOcrConfidence: number | null;
  evidence: PdfEvidence | null;
};
export type DictationEvent =
  | { type: "progress"; message: string; completed?: number; total?: number }
  | { type: "ready" }
  | { type: "result"; text: string; model: "whistle"; language: string };
export type SpeechEvidence = {
  id: string;
  operationId: string;
  generation: "absent" | "preparing" | "verified" | "integrity-error";
  format: "pcm_f32le" | "other";
  sampleRate: number;
  channels: number;
  inputBytes: number;
  terminal: "open" | "completed" | "cancelled" | "failed";
  error: string | null;
  events: DictationEvent[];
};
export type SpeechReview = {
  operationId: string;
  purpose: "prepare" | "dictate";
  evidence: SpeechEvidence | null;
};
export type UpstreamState =
  | "in-sync"
  | "ahead"
  | "behind"
  | "diverged"
  | "integration-required"
  | "auth-failed"
  | "error"
  | "exporting"
  | "pushing"
  | "local-only"
  | "not-materialized"
  | "fetch-failed"
  | "empty";
export type GitStatusEvidence = {
  id: string;
  repoPath: string;
  remote: string | null;
  branch: string | null;
  state: UpstreamState;
  observedAt: number | null;
  lastSuccessfulObservationAt: number | null;
  remoteBranchExists: boolean | null;
  candidate: { contextId: string; eventId: string } | null;
};
export type GitImportEvidence = {
  id: string;
  contextId: string;
  eventId: string;
  sourceUri: string;
  sourceKind: "git" | "archive" | "filesystem" | "upload" | "generated";
  revision: string;
  snapshotDigest: string;
  canonicalSnapshot: string | null;
  targetRepositoryIds: string[];
};
export type GitReview = {
  repoPath: string;
  repositoryId: string;
  remote: string;
  branch: string;
  mode: "observation" | "export";
  protectedMainEventId: string | null;
  status: GitStatusEvidence | null;
  imported: GitImportEvidence | null;
};
export type MediaImportRequest = {
  goal: string;
  checks: ReviewKind[];
  pdf: PdfReview | null;
  speech: SpeechReview | null;
  git: GitReview | null;
};
export type Disposition =
  | "missing-evidence"
  | "wrong-input"
  | "encrypted"
  | "missing-pages"
  | "missing-layout"
  | "missing-artifact"
  | "ocr-unavailable"
  | "ocr-review"
  | "pdf-ready"
  | "preparation-needed"
  | "preparing"
  | "prepared"
  | "integrity-error"
  | "invalid-pcm"
  | "stream-open"
  | "cancelled"
  | "stream-error"
  | "missing-transcript"
  | "silence"
  | "transcript-ready"
  | "unpublished-candidate"
  | "candidate-mismatch"
  | "needs-integration"
  | "auth-failed"
  | "fetch-failed"
  | "missing-branch"
  | "no-current-observation"
  | "upstream-diverged"
  | "export-eligible"
  | "upstream-observed"
  | "upstream-busy"
  | "upstream-error"
  | "no-exportable-event";
export type MediaFinding = {
  check: ReviewKind;
  disposition: Disposition;
  evidenceIds: string[];
  detail: string;
  transcript: string | null;
};
export type MediaImportReport = { findings: MediaFinding[] };
