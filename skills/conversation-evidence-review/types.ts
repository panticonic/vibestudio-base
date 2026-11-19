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
