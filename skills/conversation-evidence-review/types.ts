export type DeliveryInput = {
  kind: "delivery";
  goal: string;
  channelId: string;
  channelAccepted: boolean;
  originMatched: boolean;
  durableCount: number;
  recipientsResolved: boolean;
  membershipVerified: boolean;
  replayMeaningMatches: boolean;
  settlement: "pending" | "delivered" | "failed";
  accountedRetry: boolean;
};
export type SurfaceInput = {
  kind: "surface";
  goal: string;
  channelId: string;
  assignedContext: string;
  renderedContext: string;
  requiredCapabilityVisible: boolean;
  targetAgentBound: boolean;
  userTurnRecorded: boolean;
  assistantTerminal: "missing" | "completed" | "cancelled" | "failed";
  observedEffect: boolean;
  cleanupJoined: boolean;
};
export type ContractInput = {
  kind: "contract";
  goal: string;
  revision: string;
  schemaValid: boolean;
  canonicalHashMatches: boolean;
  terminalMatches: boolean;
  privateProjectionBounded: boolean;
  largeValueStoredByReference: boolean;
  typedFailures: boolean;
  retainedHistoryChecked: boolean;
  consumersChecked: boolean;
};
export type ConversationRequest = DeliveryInput | SurfaceInput | ContractInput;
export type ConversationReport = {
  kind: "delivery" | "surface" | "contract";
  basis: string;
  blockers: string[];
  ready: boolean;
};

export type DeliveryHistoryRequest = { goal: string; operationId: string };
export type DeliveryReceipt = { channelId: string; messageId: string; senderId: string };
export type DeliveryMessage = { messageId: string; senderId: string; text: string };
export type DurableDeliveryRow = DeliveryMessage & { envelopeId: string; sequence: number };
export type DeliveryHistoryObservation = {
  channelId: string;
  receipt: DeliveryReceipt;
  retained: DurableDeliveryRow[];
  rendered: DeliveryMessage[];
};
export type DeliveryOrigin = "matched" | "foreign-channel" | "missing-message" | "repeated-message" | "receipt-mismatch";
export type DeliveryConsumer = "matched" | "missing" | "divergent" | "unreviewed";
export type DeliveryHistoryReport = {
  observation: DeliveryHistoryObservation;
  origin: DeliveryOrigin;
  consumer: DeliveryConsumer;
  verified: boolean;
};

export type ChatDeliveryRequest = DeliveryHistoryRequest & {
  contextId: string;
  panelId: string;
};
export type ChatDeliveryMessage = { messageId: string; text: string };
export type ChatDeliveryPanel = {
  contextId: string | null;
  panelId: string;
  channelId: string | null;
  source: string;
  phase: string;
  messages: ChatDeliveryMessage[];
};
export type ChatDeliveryMessageVerdict =
  | "verified"
  | "message-missing"
  | "message-repeated"
  | "message-divergent";
export type ChatDeliveryReport = {
  delivery: DeliveryHistoryReport;
  panel: ChatDeliveryPanel | null;
  verdict: ChatDeliveryMessageVerdict | "history-unverified" | "panel-mismatch";
};
export type NotificationLifecycleRequest = { goal: string; operationId: string };
export type NotificationAcceptance = { notificationId: string; actionLabels: string[] };
export type NotificationDismissal = { notificationId: string };
export type NotificationLifecycleReport = {
  status: "cleaned-up" | "unverified";
  notificationId: string;
  actionLabels: string[];
  interaction: "unobserved";
};
