export type ProductUnit = "panels/chat" | "packages/agentic-chat" | "workers/agent-worker" | "packages/agentic-do" |
  "packages/agentic-protocol" | "workers/pubsub-channel" | "packages/agentic-core" | "packages/pubsub";
export type SpecialistScope = {
  channelId: string;
  contextId: string;
  taskId: string;
  concern: string;
  parentRevision: string;
  requiredProvider: string;
  mayStage: boolean;
};
export type Specialist = {
  handle: string;
  specialty: string;
  provider: string;
  participantId: string | null;
  availability: "member" | "absent" | "conflict";
};
export type SpecialistIndex = { scope: SpecialistScope; agents: Specialist[] };
export type Attempt = {
  kind: "attempt";
  handle: string;
  participantId: string;
  contextId: string;
  channelId: string;
  taskId: string;
  attemptId: string;
  provider: string;
  parentRevision: string;
  state: "running" | "completed" | "cancelled" | "failed";
};
export type Result = {
  kind: "result";
  handle: string;
  participantId: string;
  contextId: string;
  taskId: string;
  attemptId: string;
  provider: string;
  parentRevision: string;
  sourceEvent: string | null;
  sourceState: "committed" | "working";
  owner: ProductUnit;
  consumers: ProductUnit[];
  digest: string;
};
export type SpecialistRecord = Attempt | Result;
export type SpecialistRow = { messageId: string; envelopeId: string; seq: number; record: SpecialistRecord };
export type SpecialistSnapshot = { channelId: string; through: number; rows: SpecialistRow[] };
export type OriginalArtifact = { digest: string; bytes: number; text: string };
export type SpecialistReason = "no-suitable-specialist" | "ambiguous-specialist" | "unavailable-specialist" |
  "awaiting-settlement" | "cancelled-attempt" | "failed-attempt" | "unlinked-result" | "wrong-scope" |
  "provider-mismatch" | "revision-drift" | "source-uncommitted" | "readback-unavailable" | "verified";
export type ReceiptJoin = { attemptMessage: string | null; resultMessage: string | null; reason: SpecialistReason };
export type SpecialistPlan = ReceiptJoin & {
  handle: string | null;
  channelId: string;
  taskId: string;
  through: number;
  sourceEvent: string | null;
  artifact: OriginalArtifact | null;
  action: "hold" | "report" | "stage";
  explanation: string;
};
export type IntegrationArtifact = { path: string; bytes: number; sha256: string };
export type HistoryReview = {
  goal: string;
  units: { owner: ProductUnit | null; consumers: ProductUnit[]; blockers: string[] };
  result: { persistedContract: boolean; retainedHistoryChecks: string[] };
};
export type SpecialistMembershipRequest = {
  goal: string;
  channelId: string;
  contextId: string;
  handle: string;
  action: "inspect";
  options: null;
};
export type SpecialistMembership = {
  status: "observed" | "held";
  state: Specialist["availability"];
  participantId: string | null;
};
export type MembershipWitness = { request: SpecialistMembershipRequest; report: SpecialistMembership };
export type SpecialistGoalReport = {
  plan: SpecialistPlan;
  membership: MembershipWitness | null;
  history: HistoryReview | null;
  handoff: IntegrationArtifact | null;
};

export type SpecialistHistoryResult = {units:HistoryReview["units"];result:HistoryReview["result"]};
export type SpecialistResult = {plan:SpecialistPlan;membership:SpecialistMembership|null;history:SpecialistHistoryResult|null;handoff:IntegrationArtifact|null};
