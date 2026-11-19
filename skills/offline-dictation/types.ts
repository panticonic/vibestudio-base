export type DictationRequest = {
  operationId: string;
  goal: string;
  mode: "inspect" | "transcribe";
  presentation: "verbatim" | "punctuated";
};
export type DictationCapture = {
  ready: boolean;
  recording: "absent" | "too-short" | "too-large" | "invalid-sample" | "valid";
  durationMs: number | null;
  windowed: boolean;
};
export type DictationReadiness =
  | "supply-recording"
  | "repair-recording"
  | "prepare-local-worker"
  | "ready"
  | "transcribe";
export type DictationCaptureReview = {
  next: DictationReadiness;
  guidance: string;
};
export type DictationTranscript = {
  text: string;
  language: string;
  model: "whistle";
};
export type DictationDraft = {
  status: "draft" | "silence";
  text: string | null;
};
export type DictationReport = {
  capture: DictationCapture;
  review: DictationCaptureReview;
  transcript: DictationTranscript | null;
  draft: DictationDraft | null;
};
