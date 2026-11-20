export type DictationThread = {
  threadId: string;
  title: string;
  owner: string;
  draftId: string;
  baseline: string;
  device: string;
  language: string;
  usePrefix: boolean;
  localAction: "none" | "correction" | "alternative";
};
export type CaptureReceipt = {
  kind: "capture";
  captureId: string;
  owner: string;
  draftId: string;
  device: string;
  language: string;
  state: "finished" | "interrupted" | "abandoned";
};
export type SegmentReceipt = {
  kind: "segment";
  captureId: string;
  segmentId: string;
  ordinal: number;
  device: string;
  language: string;
  state: "final" | "preview";
  text: string;
};
export type Acknowledgment = {
  kind: "acknowledgment";
  captureId: string;
  draftId: string;
  throughOrdinal: number;
  state: "confirmed" | "interrupted";
};
export type DraftReceipt = {
  kind: "draft";
  draftId: string;
  revision: string;
  state: "editable" | "closed";
  text: string;
};
export type DictationRecord = CaptureReceipt | SegmentReceipt | Acknowledgment | DraftReceipt;
export type DictationRow = { messageId: string; envelopeId: string; seq: number; senderId: string; record: DictationRecord };
export type DictationSnapshot = { threadId: string; through: number; rows: DictationRow[] };

export type DictationReason = "verified" | "verified-prefix" | "wrong-device" | "language-conflict" |
  "unconfirmed" | "segment-conflict" | "missing-continuation" | "silence" | "revision-conflict" |
  "draft-closed" | "wrong-scope" | "capture-abandoned";
export type RetainedTranscript = { text: string; language: string; model: "whistle" };
export type DraftReview = { status: "draft" | "silence"; text: string | null };
export type DictationSelection = {
  captureId: string;
  segmentMessages: string[];
  draftRevision: string;
  acknowledgementMessage: string | null;
  transcript: RetainedTranscript | null;
  reason: DictationReason;
};
export type DictationPlan = DictationSelection & {
  threadId: string;
  through: number;
  draftId: string;
  action: "report" | "hold" | "stage-correction" | "stage-alternative";
  explanation: string;
};
export type DictationArtifact = { path: string; bytes: number; sha256: string };
export type DictationGoalReport = {
  plan: DictationPlan;
  review: { transcript: RetainedTranscript; presentation: "verbatim"; goal: string; result: DraftReview } | null;
  handoff: DictationArtifact | null;
};
