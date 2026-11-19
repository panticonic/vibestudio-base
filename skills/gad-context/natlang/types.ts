export type ChannelReviewRequest = {
  goal: string;
  operationId: string;
  view: "health" | "recap" | "triage";
};
export type ChannelFinding = {
  kind: string;
  count: number;
  evidence: string;
  inspector: string | null;
};
export type ChannelHealth = {
  receipt: string;
  channelId: string;
  branchId: string;
  generatedAt: string;
  integrity: "ok" | "broken";
  activity: "idle" | "in-flight";
  findings: ChannelFinding[];
};
export type FindingJudgment = {
  kind: string;
  urgency: "expected" | "investigate" | "urgent";
};
export type ChannelHealthReview = {
  evidence: ChannelHealth;
  status: "healthy" | "busy" | "investigate" | "urgent";
  judgments: FindingJudgment[];
};
export type ChannelFollowUp = {
  receipt: string;
  kind: string;
  inspector: string;
  counters: { name: string; count: number }[];
};
export type ChannelTail = {
  receipt: string;
  channelId: string;
  status: "observed" | "branch-not-supported";
  range: { fromSeq: number; toSeq: number; envelopes: number };
  standing: "agent-replied" | "awaiting-agent" | "failed" | "empty";
  latest: { seq: number; speaker: string; text: string } | null;
};
export type ConversationReview = {
  evidence: ChannelTail;
  meaning: "asks-user" | "answers-user" | "other" | "unestablished";
  note: string;
};
export type ChannelReview = {
  health: ChannelHealthReview | null;
  followUp: ChannelFollowUp | null;
  conversation: ConversationReview | null;
};
