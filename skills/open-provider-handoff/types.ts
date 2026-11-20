export type ApprovalViewer = "device-workspace" | "device-account" | "linked-agent";
export type QueueReceipt = { source: "workspace" | "hub"; kind: "snapshot" | "acknowledged" | "unavailable"; ids: string[] };
export type RequestIdentity = { id: string; provider: string; operation: string; audience: string; revision: string };
export type ConversationCard = { channelId: string; label: string; request: RequestIdentity; owner: string; viewer: ApprovalViewer; mayStage: boolean };
export type ProviderRecord =
  | { kind: "queue"; receipt: QueueReceipt }
  | { kind: "decision"; request: RequestIdentity; owner: string; state: "granted" | "denied" | "withdrawn"; hostRendered: boolean }
  | { kind: "result"; request: RequestIdentity; state: "accepted" | "committed" | "failed"; digest: string | null }
  | { kind: "note"; text: string };
export type EvidenceRow = { messageId: string; envelopeId: string; seq: number; senderId: string; record: ProviderRecord };
export type ConversationRead = { channelId: string; through: number; rows: EvidenceRow[] };
export type OutputReadback = { digest: string; sha256: string; text: string; bytes: number };
export type ProviderDisposition = "waiting" | "held" | "denied" | "ready";
export type ProviderReason = "pending-consent" | "visibility-unconfirmed" | "decision-unconfirmed" |
  "decision-denied" | "decision-withdrawn" | "request-mismatch" | "attribution-mismatch" |
  "receipt-missing" | "receipt-preliminary" | "provider-failed" | "readback-unavailable" | "verified";
export type ProviderPlan = {
  channelId: string;
  through: number;
  requestId: string;
  disposition: ProviderDisposition;
  reason: ProviderReason;
  decisionMessage: string | null;
  resultMessage: string | null;
  output: OutputReadback | null;
  explanation: string;
};
export type ProviderHandoff = { path: string; sha256: string; bytes: number };
export type ProviderGoalReport = { plan: ProviderPlan; handoff: ProviderHandoff | null };
