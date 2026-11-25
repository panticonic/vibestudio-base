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

export type ClientSurface = {
  id: string;
  title: string;
  audience: string;
  device: string;
  modifiable: boolean;
};
export type ClientCatalog = {
  surfaces: ClientSurface[];
  channel: string | null;
};
export type ClientView = {
  id: string;
  surface: ClientSurface;
  stage: string;
  text: string;
  version: string;
  width: number;
  overflow: boolean;
  controls: { id: string; label: string; enabled: boolean }[];
  signals: { sequence: number; level: string; message: string }[];
};
export type ClientViewAction =
  | { kind: "click"; control: string }
  | { kind: "viewport"; width: 320 | 390 | 1280 }
  | { kind: "reload" };
export type ClientDiagnosticStep =
  | { kind: "inspect"; surfaceId: string }
  | { kind: "act"; viewId: string; action: ClientViewAction }
  | { kind: "channel"; view: ChannelReviewRequest["view"] }
  | { kind: "finish" };
export type ClientActionReceipt = {
  status: "applied" | "changed" | "denied";
  id: string;
};
export type ClientDiagnosticOutcome =
  | "healthy"
  | "local-disagreement"
  | "stale-view"
  | "action-held"
  | "recovered"
  | "awaiting-agent"
  | "roster-needed"
  | "handoff-staged";
export type ClientDecision = {
  outcome: ClientDiagnosticOutcome;
  answer: string;
  evidenceIds: string[];
};
export type ClientHandoff = {
  audience: string;
  receipt: string;
  decision: ClientDecision;
};
export type ClientDiagnosticsReport = {
  views: ClientView[];
  effects: ClientActionReceipt[];
  channel: ChannelReview | null;
  decision: ClientDecision;
  handoff: ClientHandoff | null;
};

export type DurableQuestionMessage = {
  messageId: string;
  envelopeId: string;
  sequence: number;
  senderId: string;
  senderKind: string;
  role: "user" | "assistant";
  textBlocks: string[];
};

export type DurableQuestionHistory = {
  receipt: string;
  channelId: string;
  complete: boolean;
  through: number | null;
  messages: DurableQuestionMessage[];
};

export type DurableRosterMember = {
  participantId: string;
  handle: string | null;
  displayName: string | null;
  kind: string | null;
  joinedAt: string;
  leftAt: string | null;
};

export type DurableQuestionRoster = {
  receipt: string;
  channelId: string;
  complete: boolean;
  members: DurableRosterMember[];
};

export type DurableQuestionJudgment = {
  status: "current" | "withdrawn" | "settled" | "no-question" | "history-incomplete";
  message: DurableQuestionMessage | null;
};

export type DurableParticipantJudgment = {
  status: "confirmed" | "absent" | "incomplete" | "inactive" | "ambiguous";
  member: DurableRosterMember | null;
};

export type DurableQuestionReview = {
  history: DurableQuestionHistory;
  question: DurableQuestionJudgment;
};
export type DurableParticipantReview = {
  roster: DurableQuestionRoster;
  participant: DurableParticipantJudgment;
};
export type DurableQuestionReport = {
  historyReceipt: string;
  rosterReceipt: string | null;
  channelId: string;
  question: DurableQuestionJudgment;
  participant: DurableParticipantJudgment | {status: "not-requested"; member: null};
  disposition: "ready" | "hold";
  explanation: string;
};

export type ClientDiagnosticResult = {channel:ChannelReview|null;decision:ClientDecision;handoff:ClientHandoff|null};
