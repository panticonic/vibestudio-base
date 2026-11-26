export * from "./workspace/types.js";

import type { Acknowledgment, CaptureReceipt, DictationReason, RetainedTranscript } from "./workspace/types.js";

export type CaptureBoundary =
  | { status: "usable"; capture: CaptureReceipt; acknowledgment: Acknowledgment; messageId: string }
  | { status: "held"; reason: DictationReason; captureId: string; messageId: string | null };
export type AssembledText = { reason: DictationReason; transcript: RetainedTranscript | null; segmentMessages: string[] };

import type {DictationThread,DictationSnapshot,DictationSelection} from "./workspace/types.js";
export type DictationInvestigation = {thread:DictationThread|null; observations:DictationSnapshot[]; selection:DictationSelection|null};
