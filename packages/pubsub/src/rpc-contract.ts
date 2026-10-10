import type { ChannelEvent } from "./types.js";
import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import { channelClientRpcMethods as channelCliRpcMethods } from "@vibestudio/service-schemas/channel";
import type { ChannelCliRpc } from "@vibestudio/service-schemas/channel";
import type {
  AgentInspectionRequest,
  AgentInspectionResult,
} from "@vibestudio/shared/agentInspection";
import type {
  ChannelMethodOriginalRequest,
  ForkProjection,
  InvocationOutcome,
  MessageBlockInput,
} from "@workspace/agentic-protocol";
import type {
  ChannelInvite,
  ChannelMember,
  ChannelPresenceEntry,
  ChannelReplayEnvelope,
  ChannelConfig,
  MessageTypeDefinition,
} from "./types.js";
import type { PublishReceipt } from "./protocol-types.js";

export interface ChannelSubscribeResult {
  ok: boolean;
  participantId: string;
  revision?: number;
  channelConfig?: Record<string, unknown>;
  envelope?: ChannelReplayEnvelope;
}
/** Durable relationship joins always return the committed revision. */
export interface ChannelJoinResult extends ChannelSubscribeResult {
  revision: number;
}
export type ChannelDeliveryEndpoint =
  | { kind: "entity"; entityId: string; invocation: "direct" | "mailbox" }
  | { kind: "session" };
export interface ChannelJoinInput {
  participantId: string;
  operationId: string;
  contextId: string;
  metadata: Record<string, unknown>;
  delivery: "all" | "addressed" | "none";
  endpoint: ChannelDeliveryEndpoint;
  applicationConfig: { version: number; value: unknown } | null;
  replay: boolean;
}
export interface StoredAttachment {
  id: string; data: string; mimeType: string; name?: string; size: number;
}

export type ChannelProvenance =
  | { kind: "root" }
  | { kind: "fork"; forkedFrom: string; parentContextId: string; forkPointId: number; rootChannelId: string }
  | { kind: "task"; parentChannelId: string; parentContextId: string; runId: string };

export interface ChannelForkRequest {
  operationId: string;
  locus: { kind: "head" } | { kind: "after-message" | "before-message"; messageId: string };
  seed?: { blocks: MessageBlockInput[]; replaces?: { messageId: string } };
  label?: string;
  reason: string;
  include?: string[];
}
export interface ChannelForkResult {
  forkId: string;
  forkedChannelId: string;
  forkedContextId: string;
  clonedParticipants: string[];
  clonedAgents: Array<{ participantId: string; source: string; className: string; objectKey: string }>;
  seededMessageId?: string;
}

/** Client-visible channel RPC surface shared by runtime clients and the DO. */
export interface ChannelClientRpc extends ChannelCliRpc {
  initializeConversation(contextId: string, config?: ChannelConfig): Promise<ChannelConfig>;
  getChannelPresence(): Promise<{ entries: ChannelPresenceEntry[]; generatedAt: number }>;
  join(input: ChannelJoinInput): Promise<ChannelJoinResult>;
  leave(input: { participantId: string; revision: number }): Promise<void>;
  relationshipState(participantId: string): Promise<{ revision: number; active: boolean }>;
  unsubscribe(participantId: string, subscriptionId?: string): Promise<void>;
  publish(participantId: string, type: string, payload: unknown, opts?: {
    ref?: number;
    senderMetadata?: Record<string, unknown>;
    attachments?: StoredAttachment[];
    idempotencyKey?: string;
  }): Promise<PublishReceipt>;
  recordReceipt(participantId: string, messageId: string, state: "read", opts?: { turnId?: string }): Promise<{ recorded: true }>;
  getEnvelope(envelopeId: string): Promise<ChannelEvent | null>;
  error(participantId: string, messageId: string, errorMessage: string, code?: string): Promise<void>;
  sendSignal(participantId: string, content: string, contentType?: string): Promise<void>;
  admitPublishedEnvelopes(intents: import("@workspace/agentic-protocol").LogAppendEventInput[]): Promise<{ admitted: number }>;
  getMessageSender(participantId: string, messageId: string): Promise<string | null>;
  getPolicyState(name?: string): Promise<{
    policy: string;
    version: number;
    foldedThroughSeq: number;
    state: unknown;
  }>;
  recordTaskProvenance(args: {
    parentChannelId: string;
    parentContextId: string;
    runId: string;
  }): Promise<void>;
  resolveOpeningRequest(participantId: string, outcome: "deliver" | "cancel"): Promise<ChannelConfig>;
  updateMetadata(participantId: string, metadata: Record<string, unknown>): Promise<void>;
  setTypingState(participantId: string, typing: boolean): Promise<void>;
  addMember(input: { userId: string }): Promise<ChannelMember & { alreadyMember: boolean }>;
  removeMember(input: { userId: string }): Promise<{ removed: boolean }>;
  listMembers(): Promise<{ members: ChannelMember[] }>;
  listInvitesForMe(): Promise<{ invites: ChannelInvite[] }>;
  acknowledgeInvite(): Promise<{ acknowledged: boolean }>;
  getContextId(): Promise<string | null>;
  getConfig(): Promise<ChannelConfig | null>;
  updateConfig(config: Partial<ChannelConfig>): Promise<ChannelConfig>;
  getReplayBefore(beforeSeq: number, limit?: number): Promise<ChannelReplayEnvelope>;
  getMessageTypes(): Promise<MessageTypeDefinition[]>;
  getMessageType(typeId: string): Promise<MessageTypeDefinition | null>;
  inspectAgent(request: AgentInspectionRequest): Promise<AgentInspectionResult>;
  callMethod(callerPid: string, targetPid: string, callId: string, method: string, args: unknown, opts?: {
    invocationId?: string; transportCallId?: string; turnId?: string; timeoutMs?: number;
  }): Promise<void>;
  submitMethodResult(participantId: string, transportCallId: string, content: unknown, isError: boolean, opts?: {
    invocationId?: string; callerId?: string; turnId?: string;
    terminalOutcome?: InvocationOutcome; terminalReasonCode?: string;
    attachments?: StoredAttachment[]; providerClaimGeneration?: number;
  }): Promise<{ id?: number; dropped?: boolean; reason?: string; recovered?: boolean }>;
  submitMethodProgress(participantId: string, transportCallId: string, content: unknown, opts?: {
    invocationId?: string; turnId?: string; attachments?: StoredAttachment[]; providerClaimGeneration?: number;
  }): Promise<void>;
  cancelMethodCall(participantId: string, callId: string, original?: ChannelMethodOriginalRequest): Promise<void>;
  claimMethodCall(participantId: string, transportCallId: string, providerGenerationId: string): Promise<{ claimed: boolean; generation?: number }>;
  markMethodCallExecutionStarted(participantId: string, transportCallId: string, providerClaimGeneration: number): Promise<{ accepted: boolean }>;
  getProvenance(): Promise<ChannelProvenance>;
  fork(request: ChannelForkRequest): Promise<ChannelForkResult>;
  renameFork(forkId: string, label: string): Promise<void>;
  archiveFork(forkId: string): Promise<void>;
  listForks(): Promise<{ forks: ForkProjection[]; headSeq: number }>;
  subscribeLineage(participantId: string): Promise<Response>;
}

const channelPrivateRpcMethods = createReceiverRpcMethods<Omit<ChannelClientRpc, keyof ChannelCliRpc>>([
  "initializeConversation", "getChannelPresence", "join", "leave", "relationshipState",
  "unsubscribe", "publish", "recordReceipt",
  "getEnvelope", "error", "sendSignal", "admitPublishedEnvelopes", "getMessageSender",
  "getPolicyState", "recordTaskProvenance", "resolveOpeningRequest", "updateMetadata", "setTypingState", "addMember",
  "removeMember", "listMembers", "listInvitesForMe", "acknowledgeInvite", "getContextId",
  "getConfig", "updateConfig", "getReplayBefore", "getMessageTypes", "getMessageType",
  "inspectAgent", "callMethod", "submitMethodResult", "submitMethodProgress", "cancelMethodCall",
  "claimMethodCall", "markMethodCallExecutionStarted", "getProvenance", "fork", "renameFork",
  "archiveFork", "listForks", "subscribeLineage",
]);

export const channelClientRpcMethods = {
  ...channelPrivateRpcMethods,
  ...channelCliRpcMethods,
};
