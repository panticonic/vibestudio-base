export type Addressee = { ref: string; kind: string; note: string };
export type Resolution =
  | { kind: "ref"; ref: string; note: string }
  | { kind: "ambiguous"; reason: "none" | "several"; candidates: Addressee[] };
export type Snapshot = {
  fixtureId: string;
  channelId: string;
  revision: string;
  rows: Addressee[];
  resolution: Resolution;
};
export type Decision = {
  kind: "deliver" | "hold";
  ref: string | null;
  reason: string;
};
export type Draft = { content: string; facts: string[] };
export type Receipt = {
  messageId: string;
  channelId: string;
  to: string;
  alert: "none";
};
export type DeliveryEvidence = {
  channelId: string;
  messageId: string | null;
  committed: boolean;
  recipientRefs: string[];
  content: string | null;
  evidence: string[];
};
export type Verification = {
  passed: boolean;
  evidence: string[];
  openQuestions: string[];
};
