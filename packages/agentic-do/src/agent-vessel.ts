import { createProvider, Type, type Api, type Model } from "@panticonic/pi-ai";
import { authorNativeTool } from "@workspace/harness";
import { openAICompletionsApi } from "@panticonic/pi-ai/api/openai-completions.lazy";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  defineExtension,
  bindTool,
  type Conversation,
  type ConversationId,
  type EntryId,
  type Extension,
  type Harness,
  type HarnessCommit,
  type ModelRequestTarget,
  type ModelRequestApi,
  type ModelRequestConnection,
  type SubmissionId,
  type TaskId,
  type Tx,
  type ToolRegistration,
  type ToolExecutionApi,
  type ToolExecutionResult,
  type SettledSubmissionRecord,
} from "@panticonic/pi-durable";
import { copyJson, type Context, type JsonValue } from "@panticonic/pi-chord";
import type { NativeEvalExecution } from "@workspace/harness/tools/eval";
import {
  NativeChannelOwner,
  type NativeChannelConfiguration,
} from "./native-channel-owner.js";
import { parseDoTargetId } from "@vibestudio/shared/workspaceServiceRpc";
import {
  importAgentChannelKnowledge,
  type ExportChannelKnowledgeInput,
  type ImportChannelKnowledgeInput,
  type NativeChannelKnowledge,
} from "@workspace/agentic-core/native-channel-knowledge";
import {
  retainedNativeChannelKnowledgeConfiguration,
  exportNativeChannelKnowledge,
  importNativeChannelKnowledge,
} from "./native-channel-knowledge.js";
import { createNativeAutomationRuns } from "./native-automation-runs.js";
import { createNativeEvalExecution } from "./native-eval-tool.js";
import { createNativeChannelMethodTools } from "./native-channel-method-tools.js";
import { createNativeSuspendExecution } from "./native-suspend-tool.js";
import {
  createNativeChannelMethodExecution,
  consumeNativeChannelMethodReceipt,
  nativeChannelMethodReceiptKey,
  readCanonicalChannelProviderOutcome,
  readCanonicalChannelProviderTerminal,
} from "./native-channel-method.js";
import {
  notifyModelCredentialChange,
  createProtectedModelAuth,
} from "./native-model-provider.js";
import {
  abortQueuedAgentConversations,
  retainedAgentExecutionOwner,
} from "./native-agent-session.js";
import {
  observeNativeModelConnection,
  prepareNativeModelEvidence,
  readNativeChannelInspection,
  readNativeModelExecutionEvidence,
} from "./native-model-evidence.js";
import { contextIdForTargetKey } from "@vibestudio/shared/runtime/contextIdentity";
import {
  createNativeProductModelPolicy,
  nativeProductStream,
  type NativeProductModelSettings,
} from "./native-product-model-policy.js";
import {
  nativeAnswerEnvelopeId,
  waitForNativeAnswerPublication,
  type NativePublishedAnswer,
} from "./native-channel-publication.js";
import { createNativeModelReset } from "./native-model-reset.js";
import { createNativeConversationCancellation } from "./native-conversation-cancellation.js";
import { retainNativeSubagentTerminal } from "./native-subagent-terminal.js";
import {
  createNativeChildLaunch,
  type NativeChildLaunchIntent,
} from "./native-child-launch.js";
import { createNativeInputSettlement } from "./native-input-settlement.js";
import { withPreparedNativeModel } from "./native-prepared-model-helper.js";
import type { CredentialedModelConnection } from "./native-model-transport.js";
import { OwnedMethodCalls } from "./owned-method-calls.js";
import {
  prepareNativeProductContexts,
  recordNativeProductInput,
  nativeTaskProductContext,
} from "./native-product-context.js";
import type { NativeInvocationExecution } from "./native-invocation-boundary.js";
import {
  recordNativeChannelInputAdmission,
  retainedNativeConversationChannel,
  verifyNativeChannelDeliveryReplay,
  type NativeChannelIntake,
  type NativeChannelInputPrepare,
  waitForNativeChannelSourceMessageAt,
} from "./native-channel-session.js";
import { WorkspaceAutomationSchema } from "@vibestudio/workspace-contracts/automations";
/**
 * Product composition over one native Pi Session. This vessel owns channel
 * membership, presentation, automation provenance and child resources; native
 * tasks own model/tool execution, durable waits and cancellation.
 */

import {
  createOutsideContentReset,
  type OutsideContentReset,
} from "./outside-content-reset.js";
import {
  type DurableObjectContext,
  type LifecyclePrepareInput,
} from "@workspace/runtime/worker/durable-base";

import {
  rpc,
  withRpcAbortSignal,
  type RpcCaller,
  type RpcClient,
} from "@vibestudio/rpc";
import { withExecutionAdmission } from "@vibestudio/rpc/internal";
import {
  createGadServiceClient,
  type DurableObjectServiceClient,
} from "@workspace/runtime/workerd-client";
import type {
  ChannelAgenticContext,
  RegisterMessageTypeInput,
  RpcChannelMessage,
} from "@workspace/pubsub";
import { iterateChannelReplayAfterPages } from "@workspace/pubsub";
import {
  driveMerge,
  renderCompareReview,
  renderMergeReview,
} from "@workspace/harness/merge-driver";
import {
  composeSystemPrompt,
  type SystemPromptMode,
} from "@workspace/harness/system-prompt";

import { resolveToolFile } from "@workspace/harness/semantic-file-resolution";
import { splitRepoPath } from "@vibestudio/shared/runtime/entitySpec";
import type {
  ChannelEvent,
  ParticipantDescriptor,
} from "@workspace/harness/types";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  AGENTIC_PROTOCOL_VERSION,
  hydrateStoredValueRefs,
  isRespondPolicy,
  participantRefFromMetadata,
  resolveShouldRespond,
  resolveHandle,
  isHandleResolutionFailure,
  type ActorRef,
  type AgenticEvent,
  type AutomationDefinitionSnapshot,
  type CustomMessageDisplayMode,
  type ParticipantRef,
  type AddresseeDirectoryEntry,
  type AddresseeUserEntry,
  type ResolveAddresseeContext,
} from "@workspace/agentic-protocol";
import {
  canonicalJson,
  sha256HexSyncText,
  stableSha256Hex,
} from "@vibestudio/content-addressing";
import { createTypedServiceClient } from "@vibestudio/shared/typedServiceClient";

import {
  createAgentEntity,
  createSubagentContext,
  publishAgentTaskSeed,
  subscribeAgentToChannel,
} from "@workspace/agentic-core/agent-launch";
import { resolveAgentObservationConfig } from "@workspace/agentic-core";
import {
  subagentFirstTaskPrompt,
  subagentRuntimePrompt,
  type SubagentIdentity,
} from "@workspace/agentic-core/subagent-prompt";
import {
  MISSION_COMPLETION_PROTOCOL,
  missionExecutionImageDigest,
  type AutomationExecutorRunStatus,
  type MissionAgentAction,
  type MissionAuthorityPlanReference,
  type MissionAuthorityProjection,
  type MissionOperationIntent,
  type MissionRecord,
  type MissionTrigger,
} from "@vibestudio/automation/mission";

import {
  AGENT_INSPECTION_METHODS,
  isAgentInspectionMethod,
  type AgentInspectionMethod,
} from "@vibestudio/shared/agentInspection";

import {
  vcsMethods,
  type VcsIntegrationProjection,
  type VcsMergeInput,
  type VcsStateNodeRef,
} from "@vibestudio/service-schemas/vcs";
import { toCredentialConnectRequest } from "@workspace/model-catalog/providerConnect";
import type { RespondPolicy } from "@workspace/agentic-protocol";
import type { ModelFailureClass } from "@workspace/agentic-core/model-failures";
import type { RosterEntry } from "@workspace/agentic-core/agent-channel-roster";
import {
  MODEL_SETTINGS_SERVICE_PROTOCOL,
  type AgentThinkingLevel as ThinkingLevel,
} from "@workspace/model-catalog/catalog";
import { createDurableObjectServiceClient } from "@vibestudio/shared/workspaceServiceRpc";

import { modelTransportRuntimeEvidence } from "./model-transport-runtime.js";

import type { AgentProductMetadata } from "@workspace/agentic-core/agent-product-metadata";

interface NativeChannelSelection {
  readonly targetChannelId: string;
  readonly intake: NativeChannelIntake;
}

export interface AgentToolExecutionContext {
  readonly invocationId: string;
  /** Stable semantic command id derived from the exact causal invocation. */
  readonly commandId: string;
  /** Immutable caller bound to the exact trajectory invocation that caused the tool call. */
  readonly rpc: RpcClient;
  readonly metadata?: AgentProductMetadata;
}
import type {
  ConnectCredentialRequest,
  StoredCredentialSummary as ModelCredentialSummary,
} from "@workspace/runtime/credentials";
import { DOIdentity } from "./identity.js";
import {
  SubscriptionManager,
  type PreparedChannelSubscription,
} from "./subscription-manager.js";
import { createNativeChannelBootstrap } from "./native-channel-bootstrap.js";
import {
  SubagentRunStore,
  subagentRunReference,
  type SubagentRunRow,
} from "./subagent-runs.js";
import { ChannelClient } from "./channel-client.js";
import { ChannelMethodRelays } from "./channel-method-relays.js";

import { CardManager } from "./custom-cards.js";
import {
  LOCAL_FALLBACK_MODEL_REF,
  LOCAL_MODELS_EXTENSION_ID,
  LOCAL_PROVIDER_ID,
  materializeModel,
  type LocalModelDescriptor,
  type MaterializedModel,
} from "./model-spec.js";

const CHANNEL_STATE_CACHE_MS = 5_000;
/** Final backstop cadence for undelivered deferred-eval cancel intents. The
 * primary triggers are lifecycle events (resume, retire); this alarm only
 * covers an EvalDO outage that outlives them. */

/** ~256KB of serialized session entries before compaction — comfortably
 *  under modern model context windows while keeping plenty of recent
 *  history. Subclasses override getCompactionTriggerBytes for a tighter or
 *  model-sized budget. */
const DEFAULT_COMPACTION_TRIGGER_BYTES = 256 * 1024;
/** Subagent guardrails (overridable per-agent via config). Depth bounds the
 *  spawn chain; owned slots bound child contexts per supervisor. */
const DEFAULT_MAX_SUBAGENT_DEPTH = 3;
const DEFAULT_MAX_SUBAGENTS = 3;
const PARTICIPANT_HANDLE_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const SUBAGENT_MERGE_PROTOCOL = "vibestudio.subagent-merge.v1";

/** The roster as the addressee resolver wants it. The loop's `RosterEntry`
 *  keeps the handle and the participant id beside the ref rather than inside
 *  it, so lift both in — otherwise `@handle` resolution never sees a handle. */
/**
 * `owner` resolves to the one person on this channel — and only when there is
 * exactly one.
 *
 * There is no separate channel-ownership fact in this build, and the roster is
 * the honest approximation: a single-human channel has an unambiguous owner. A
 * channel with several people does NOT, so `owner` fails closed there and the
 * agent is told to name whom it meant. Picking the first human would be exactly
 * the "tell the wrong person" failure the addressee model exists to prevent.
 */
function soleChannelUserId(
  roster: readonly ParticipantRef[],
): string | undefined {
  const users = roster.filter((entry) => entry.kind === "user");
  if (users.length !== 1) return undefined;
  const id = users[0]?.participantId ?? users[0]?.id ?? "";
  return id.startsWith("user:") ? id.slice("user:".length) : id || undefined;
}

function rosterParticipantRef(entry: RosterEntry): ParticipantRef {
  const handle =
    entry.handle ??
    (entry.ref.metadata as { handle?: unknown } | undefined)?.handle ??
    undefined;
  return {
    ...entry.ref,
    participantId: entry.ref.participantId ?? entry.participantId,
    ...(typeof handle === "string" && handle
      ? { metadata: { ...(entry.ref.metadata ?? {}), handle } }
      : {}),
  };
}

function subagentLaunchReceipt(
  run: Pick<SubagentRunRow, "nativeTaskId" | "status">,
): string {
  const handle = subagentRunReference(run);
  if (run.status !== "starting" && run.status !== "running") {
    return `subagent ${handle} already exists with status ${run.status}`;
  }
  return (
    `subagent ${handle} (address run:${handle}) is running in the background. Continue independent foreground work, ` +
    `or call suspend_turn({ reason: "waiting_for_background" }) if no foreground work remains. ` +
    `Do not inspect, read, or merge merely to wait; a child report will resume you.`
  );
}

function subagentVcsCommandId(
  phase: "merge",
  run: Pick<SubagentRunRow, "runId" | "parentContextId" | "childContextId">,
  basis: Record<string, unknown>,
): string {
  return `subagent-${phase}:${stableSha256Hex({
    protocol: SUBAGENT_MERGE_PROTOCOL,
    runId: run.runId,
    parentContextId: run.parentContextId,
    childContextId: run.childContextId,
    basis,
  })}`;
}

function createSubagentVcsClient(rpcClient: RpcClient) {
  return createTypedServiceClient("vcs", vcsMethods, (_service, method, args) =>
    rpcClient.call("main", `vcs.${method}`, args),
  );
}

function semanticIntegrationFromProjection(
  projection: VcsIntegrationProjection,
) {
  const state =
    projection.remainingCoordinateCount === 0 && projection.concluded
      ? "complete"
      : projection.mergeableCoordinateCount > 0
        ? "integrating"
        : "needs-decision";
  return { state, ...projection };
}

function sameVcsStateNodeRef(left: unknown, right: VcsStateNodeRef): boolean {
  if (!left || typeof left !== "object") return false;
  const candidate = left as Record<string, unknown>;
  return right.kind === "event"
    ? candidate["kind"] === "event" && candidate["eventId"] === right.eventId
    : candidate["kind"] === "application" &&
        candidate["applicationId"] === right.applicationId;
}

function semanticIntegrationForRun(
  run: SubagentRunRow,
  projections: readonly VcsIntegrationProjection[] = [],
  currentWorkingHead?: VcsStateNodeRef,
): Record<string, unknown> {
  const live = run.sourceEventId
    ? projections.find(
        (entry) =>
          entry.source.kind === "event" &&
          entry.source.eventId === run.sourceEventId,
      )
    : undefined;
  if (live) return semanticIntegrationFromProjection(live);
  const receipt = run.semanticIntegrationSnapshot;
  const receiptSource = receipt?.["source"];
  if (
    receipt &&
    currentWorkingHead &&
    run.sourceEventId &&
    receiptSource &&
    typeof receiptSource === "object" &&
    (receiptSource as Record<string, unknown>)["kind"] === "event" &&
    (receiptSource as Record<string, unknown>)["eventId"] ===
      run.sourceEventId &&
    sameVcsStateNodeRef(receipt["asOfWorkingHead"], currentWorkingHead)
  ) {
    return receipt;
  }
  return { state: "unattempted", sourceEventId: run.sourceEventId };
}

const OBSERVABLE_SUBAGENT_CONFIG_KEYS = [
  "model",
  "thinkingLevel",
  "fastMode",
  "fallbackModel",
  "fallbackThinkingLevel",
  "fallbackOn",
  "fallbackScope",
  "approvalLevel",
  "respondPolicy",
] as const;

function observableSubagentLaunchConfig(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!value) return null;
  const selected = Object.fromEntries(
    OBSERVABLE_SUBAGENT_CONFIG_KEYS.flatMap((key) =>
      value[key] === undefined ? [] : [[key, value[key]]],
    ),
  );
  return Object.keys(selected).length > 0 ? selected : null;
}

export type ApprovalLevel = 0 | 1 | 2;

export type CustomMessageReducer = (state: unknown, update: unknown) => unknown;

export interface AgentSettings {
  model: string;
  thinkingLevel: ThinkingLevel;
  fastMode: boolean;
  fallbackModel?: string;
  fallbackThinkingLevel?: ThinkingLevel;
  fallbackOn?: ModelFailureClass[];
  fallbackScope?: "unattended" | "all-turns";
  approvalLevel: ApprovalLevel;
  respondPolicy: RespondPolicy;
  respondFrom: string[];
}

/** Per-channel settings — a Ref-kind KV value; every model call journals the
 *  values it actually used in its request descriptor, so the audit trail is
 *  the log, not this pointer. */
interface StoredSettings extends Partial<AgentSettings> {}

const CONFIGURABLE_FALLBACK_FAILURE_CODES = new Set([
  "usage_limit_terminal",
  "quota_exhausted_terminal",
  "rate_limited_retryable",
  "provider_overloaded_retryable",
  "auth_or_credentials",
  "circuit_breaker_open_retryable",
  "unknown_retryable",
]);

function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return (
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh" ||
    value === "max"
  );
}

function isFallbackOn(value: unknown): value is ModelFailureClass[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (code) =>
        typeof code === "string" &&
        CONFIGURABLE_FALLBACK_FAILURE_CODES.has(code),
    )
  );
}

/**
 * The agent's settings record is PER-AGENT (channel-independent): one model,
 * thinking level, approval posture, respond policy, etc. for the agent across
 * every channel it joins. Membership is per-channel (the subscriptions table);
 * behavior config is not.
 */
const AGENT_SETTINGS_KEY = "agent:settings";

const MAX_CHANNEL_OBSERVATION_CHARS = 32_768;
const MAX_CHANNEL_OBSERVATION_PREVIEW_CHARS = 8_192;

export interface ChannelObservationInput {
  kind: "channel-observation";
  version: 1;
  source: {
    channelId: string;
    envelopeId: string;
    sequence?: number;
    payloadKind: string;
    timestamp: number;
    sender: ParticipantRef;
  };
  payload: unknown;
  truncated?: {
    originalChars: number;
    preview: string;
  };
}

/**
 * Resolve a per-agent `respondFrom` allowlist (handles and/or participant ids) to
 * THIS channel's participant ids, so "who I respond to" travels with the agent
 * across channels. An entry matching a participant's handle maps to that
 * participant's id; an entry that matches nothing is kept as-is (already an id).
 * Pure + exported for direct testing.
 */
export function resolveRespondFromHandles(
  respondFrom: readonly string[],
  participants: ReadonlyArray<{
    participantId: string;
    metadata?: Record<string, unknown> | null;
  }>,
): string[] {
  const handleToId = new Map<string, string>();
  for (const p of participants) {
    const handle = p.metadata?.["handle"];
    if (typeof handle === "string" && handle.length > 0)
      handleToId.set(handle, p.participantId);
  }
  return respondFrom.map((entry) => handleToId.get(entry) ?? entry);
}

function configuredParticipantHandle(config: unknown): string | null {
  if (!config || typeof config !== "object") return null;
  const handle = (config as Record<string, unknown>)["handle"];
  return typeof handle === "string" && handle.length > 0 ? handle : null;
}

function configuredWakePolicy(
  config: unknown,
): "every-envelope" | "explicit" | "manual" {
  if (!config || typeof config !== "object") return "every-envelope";
  const wakePolicy = (config as Record<string, unknown>)["wakePolicy"];
  return wakePolicy === "explicit" || wakePolicy === "manual"
    ? wakePolicy
    : "every-envelope";
}

function sanitizeParticipantHandlePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function deriveSubagentParticipantHandle(
  baseHandle: string,
  runId: string,
  objectKey?: string,
): string {
  if (objectKey && PARTICIPANT_HANDLE_PATTERN.test(objectKey)) return objectKey;

  const base = sanitizeParticipantHandlePart(baseHandle) || "agent";
  const suffixSource =
    sanitizeParticipantHandlePart(objectKey ?? runId) || "subagent";
  const suffix = suffixSource.slice(-16);
  const maxBaseLength = Math.max(1, 63 - suffix.length);
  const trimmedBase =
    base.slice(0, maxBaseLength).replace(/[-_]+$/g, "") || "agent";
  const candidate = `${trimmedBase}-${suffix}`;
  const handle = /^[a-zA-Z]/.test(candidate) ? candidate : `a-${candidate}`;
  return handle.slice(0, 64);
}

export interface AgentPromptResources {
  workspacePrompt?: string;
  skillIndex?: string;
}

export interface AgentPromptOverride {
  systemPrompt?: string;
  systemPromptMode?: SystemPromptMode;
}

// Shared subagent prompt contract, re-exported for local tests.
export {
  subagentFirstTaskPrompt,
  subagentRuntimePrompt,
} from "@workspace/agentic-core/subagent-prompt";
export type { SubagentIdentity } from "@workspace/agentic-core/subagent-prompt";

type BrowserOpenMode = "internal" | "external";
type BrowserHandoffCallerKind = "app" | "panel" | "shell";
type ConnectCredentialEnvelope = {
  spec: ConnectCredentialRequest;
  handoffTarget: {
    callerId: string;
    callerKind: BrowserHandoffCallerKind;
  };
};

function isSystemPromptMode(value: unknown): value is SystemPromptMode {
  return (
    value === "append" || value === "replace" || value === "replace-vibestudio"
  );
}

function normalizeBrowserOpenMode(value: unknown): BrowserOpenMode {
  return value === "internal" ? "internal" : "external";
}

function normalizeBrowserHandoffTarget(input: {
  browserHandoffCallerId?: unknown;
  browserHandoffCallerKind?: unknown;
}): ConnectCredentialEnvelope["handoffTarget"] | null {
  const callerId = input.browserHandoffCallerId;
  const callerKind = input.browserHandoffCallerKind;
  if (typeof callerId !== "string" || callerId.length === 0) return null;
  if (callerKind !== "app" && callerKind !== "panel" && callerKind !== "shell")
    return null;
  return { callerId, callerKind };
}

/** Context handed to {@link AgentVesselBase.onChannelForked} after a clone. */
export interface ClonedChannelContext {
  /** Channel id the parent was subscribed to (the clone is NOT subscribed to it). */
  oldChannelId: string;
  /** Channel id the clone is about to be subscribed to. */
  newChannelId: string;
  forkPointPubsubId: number;
}

export interface AgentInitiatedTurnOptions extends AgentProductMetadata {
  steeringId?: string;
}

interface ChannelDeliveryInput {
  deliveryId: string;
  channelId: string;
  channelRef: { source: string; className: string; objectKey: string };
  participantId: string;
  subscriptionRevision: number;
  eventSequence: number;
  envelope: unknown;
  agenticContext: ChannelAgenticContext;
}

interface ChannelDeliveryOutcome {
  deliveryId: string;
  disposition: "processed" | "duplicate" | "declined";
  recipientExecutionStartedAt?: number;
}

const HOT_PATH_TRACE_RETENTION_LIMIT = 500;
const HOT_PATH_TRACE_SWEEP_INTERVAL = 64;

/** Result of the deferred-eval gate: parked, or a settled tool result whose
 * typed terminal fields flow unchanged into the trajectory invocation event. */

interface NativeProductChannelConfiguration extends NativeChannelConfiguration {
  readonly modelPolicy: NativeProductModelSettings;
}

export abstract class AgentVesselBase extends NativeChannelOwner<NativeProductChannelConfiguration> {
  static override schemaVersion = 1;

  protected readonly identity: DOIdentity;
  protected readonly subscriptions: SubscriptionManager;

  protected readonly cards: CardManager;
  protected readonly subagentRuns: SubagentRunStore;
  /** Activation-local admission intents make concurrent sibling snapshots
   * accurate without advancing durable status before prompt admission. */
  private readonly admittingSubagentTerminals = new Map<
    string,
    "completed" | "failed" | "cancelled" | "abandoned"
  >();

  /** Deferred evals are child resources of the channel that started them. */

  private readonly channelClients = new Map<string, ChannelClient>();
  private readonly channelConfigCache = new Map<
    string,
    { expiresAt: number; value: Record<string, unknown> | null }
  >();
  private readonly participantCache = new Map<
    string,
    {
      expiresAt: number;
      value: Array<{
        participantId: string;
        ref: ParticipantRef;
        metadata: Record<string, unknown>;
      }>;
    }
  >();
  /** Derived scheduling state only; the durable trace rows remain authoritative. */
  private readonly hotPathTraceInsertsSinceSweep = new Map<string, number>();
  private readonly directMethodCalls = new OwnedMethodCalls<{
    result: unknown;
    isError?: boolean;
  }>();
  /** Actual finite Eval RPC relays, retained until transport/provider/hydration join. */
  private readonly channelMethodRelays = new ChannelMethodRelays();

  constructor(ctx: DurableObjectContext, env: unknown) {
    super(ctx, env);
    this.identity = new DOIdentity(this.sql);
    this.subscriptions = new SubscriptionManager(
      this.sql,
      (channelId) => this.createChannelClient(channelId),
      this.identity,
    );
    this.subagentRuns = new SubagentRunStore(this.sql);

    this.cards = new CardManager({
      sql: this.sql,
      createChannelClient: (channelId) => this.createChannelClient(channelId),
      getParticipantId: (channelId) =>
        this.subscriptions.getParticipantId(channelId),
      getActor: () => ({ kind: "agent", id: this.participantId() }),
      getAgentId: () => this.objectKey,
    });
  }

  protected override afterSchemaReady(): void {}

  protected override createAgentTables(): void {
    DOIdentity.createTables(this.sql);
    SubscriptionManager.createTables(this.sql);
    SubagentRunStore.createTables(this.sql);
    CardManager.createTables(this.sql);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS agent_hot_path_trace (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT NOT NULL, phase TEXT NOT NULL, source TEXT, item_id TEXT,
      generation INTEGER, started_at INTEGER NOT NULL, duration_ms INTEGER,
      details_json TEXT NOT NULL
    ); CREATE INDEX IF NOT EXISTS idx_agent_hot_path_trace_channel
      ON agent_hot_path_trace(channel_id, sequence)`);
  }

  protected override requiredTables(): readonly string[] {
    return [
      ...super.requiredTables(),
      "do_identity",
      "subscriptions",
      "agent_hot_path_trace",
      "subagent_runs",
      "custom_cards",
    ];
  }

  protected traceHotPath(
    channelId: string,
    phase: string,
    input: {
      startedAt?: number;
      source?: string;
      itemId?: string;
      generation?: number;
      details?: Record<string, string | number | boolean | null>;
    } = {},
  ): void {
    const now = Date.now();
    const startedAt = input.startedAt ?? now;
    this.sql.exec(
      `INSERT INTO agent_hot_path_trace (
         channel_id, phase, source, item_id, generation,
         started_at, duration_ms, details_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      channelId,
      phase,
      input.source ?? null,
      input.itemId ?? null,
      input.generation ?? null,
      startedAt,
      input.startedAt === undefined ? null : Math.max(0, now - startedAt),
      JSON.stringify(input.details ?? {}),
    );
    const insertsSinceSweep =
      (this.hotPathTraceInsertsSinceSweep.get(channelId) ??
        HOT_PATH_TRACE_SWEEP_INTERVAL - 1) + 1;
    if (insertsSinceSweep < HOT_PATH_TRACE_SWEEP_INTERVAL) {
      this.hotPathTraceInsertsSinceSweep.set(channelId, insertsSinceSweep);
      return;
    }
    this.sql.exec(
      `DELETE FROM agent_hot_path_trace
        WHERE channel_id = ?
          AND sequence NOT IN (
            SELECT sequence FROM agent_hot_path_trace
             WHERE channel_id = ?
             ORDER BY sequence DESC
             LIMIT ${HOT_PATH_TRACE_RETENTION_LIMIT}
          )`,
      channelId,
      channelId,
    );
    this.hotPathTraceInsertsSinceSweep.set(channelId, 0);
  }

  private hotPathTrace(channelId: string): Array<Record<string, unknown>> {
    return (
      this.sql
        .exec(
          `SELECT sequence, phase, source, item_id, generation,
                  started_at, duration_ms, details_json
             FROM agent_hot_path_trace
            WHERE channel_id = ?
            ORDER BY sequence`,
          channelId,
        )
        .toArray() as Array<Record<string, unknown>>
    ).map((row) => ({
      sequence: Number(row["sequence"]),
      phase: String(row["phase"]),
      ...(row["source"] == null ? {} : { source: String(row["source"]) }),
      ...(row["item_id"] == null ? {} : { itemId: String(row["item_id"]) }),
      ...(row["generation"] == null
        ? {}
        : { generation: Number(row["generation"]) }),
      startedAt: Number(row["started_at"]),
      ...(row["duration_ms"] == null
        ? {}
        : { durationMs: Number(row["duration_ms"]) }),
      details: JSON.parse(String(row["details_json"])),
    }));
  }

  /** Retirement is the final owner of every live child obligation. Fence each
   * child first, then publish the supervisor-authored durable terminal while
   * the parent is still subscribed to both channels. A partial failure keeps
   * retirement uncommitted; retrying is idempotent at both boundaries. */
  private async retireRetainedSubagents(): Promise<void> {
    const results = await Promise.allSettled(
      this.subagentRuns
        .listAll()
        .filter((run) => run.status !== "abandoned")
        .map(async (run) => {
          await this.agentRpc.call(
            run.childEntityId,
            "retireSubagentExecution",
            [
              {
                runId: run.runId,
                taskChannelId: run.taskChannelId,
                reason: "supervisor retired",
              },
            ],
          );
          await this.settleSubagentTerminal(
            run,
            "abandoned",
            "supervisor retired",
          );
        }),
    );
    this.requireResourceCleanup(results);
  }

  // ── Subclass surface (WS1 §3.2 — names preserved where semantics survive) ─

  protected getDefaultModel(): string {
    return "anthropic:claude-sonnet-4-6";
  }
  protected getDefaultThinkingLevel(): ThinkingLevel {
    return "medium";
  }
  protected getDefaultApprovalLevel(): ApprovalLevel {
    return 2;
  }
  protected getDefaultRespondPolicy(): RespondPolicy {
    return "mentioned-or-followup";
  }
  protected getDefaultRespondFrom(): string[] {
    return [];
  }
  /** Idle-history byte budget that triggers compaction. Subclasses with a
   *  known model context window should override this to ~0.7× the window
   *  (in serialized-entry bytes). */
  protected getCompactionTriggerBytes(): number {
    return DEFAULT_COMPACTION_TRIGGER_BYTES;
  }

  /** Channel publication discipline (WS-4 `publishPolicy` StepPolicy). Default
   *  agents publish everything (`undefined` ⇒ "all"); the silent agent overrides
   *  this to "notify-only" (the old `silentPolicy` behavior). */
  protected getPublishPolicy(
    _channelId: string,
  ): "all" | "turn-final" | "notify-only" | undefined {
    return undefined;
  }

  /** Max subagent nesting depth enforced at spawn. */
  protected getMaxSubagentDepth(): number {
    return DEFAULT_MAX_SUBAGENT_DEPTH;
  }

  /** Maximum concurrent child executions; terminal results are retained outside this count. */
  protected getMaxSubagents(): number {
    return DEFAULT_MAX_SUBAGENTS;
  }

  protected abstract getParticipantInfo(
    channelId: string,
    config?: unknown,
  ): ParticipantDescriptor;

  protected getEffectiveParticipantInfo(
    channelId: string,
    config?: unknown,
  ): ParticipantDescriptor {
    const declared = this.getParticipantInfo(channelId, config);
    // The agent's own one-line self-description (`set_description`) rides the
    // roster metadata: it is what the workspace directory shows and searches
    // (messaging plan §4.4, D9), and it survives rejoin because it lives here.
    const description = this.agentDescription(channelId);
    const base: ParticipantDescriptor = description
      ? { ...declared, metadata: { ...(declared.metadata ?? {}), description } }
      : declared;
    const subagent = this.subagentIdentity();
    if (!subagent) return base;
    // The run identity rides on the roster metadata so the workspace agent
    // directory can carry lineage (messaging plan §4.4) without a second writer.
    const descriptor: ParticipantDescriptor = {
      ...base,
      metadata: { ...(base.metadata ?? {}), subagentRunId: subagent.runId },
    };

    const configuredHandle = configuredParticipantHandle(config);
    if (configuredHandle) return { ...descriptor, handle: configuredHandle };

    let objectKey: string | undefined;
    try {
      objectKey = this.objectKey;
    } catch {
      objectKey = undefined;
    }
    return {
      ...descriptor,
      handle: deriveSubagentParticipantHandle(
        descriptor.handle,
        subagent.runId,
        objectKey,
      ),
    };
  }

  /** The self-description this agent set for a channel, if any. */
  protected agentDescription(channelId: string): string | null {
    try {
      const value = this.getStateValue(`agent:description:${channelId}`);
      return typeof value === "string" && value.trim() ? value : null;
    } catch {
      return null;
    }
  }

  /**
   * Set (or clear) this agent's self-description on a channel and revise its
   * roster metadata so the directory reflects it now — not on the next join.
   */
  protected async setAgentDescription(
    channelId: string,
    description: string | null,
    rpc: RpcClient = this.rpc,
  ): Promise<void> {
    if (description)
      this.setStateValue(`agent:description:${channelId}`, description);
    else this.deleteStateValue(`agent:description:${channelId}`);
    const participantId = this.subscriptions.getParticipantId(channelId);
    if (!participantId) return;
    const descriptor = this.getEffectiveParticipantInfo(
      channelId,
      this.subscriptions.getConfig(channelId),
    );
    await this.createChannelClient(channelId, rpc).updateMetadata(
      participantId,
      {
        name: descriptor.name,
        type: descriptor.type,
        handle: descriptor.handle,
        ...(descriptor.metadata ?? {}),
        ...(descriptor.methods?.length ? { methods: descriptor.methods } : {}),
      },
    );
  }

  /** Workspace-level prompt resources. Workspace agents load AGENTS.md and the
   *  skill index here; non-workspace agents may return nothing. */
  protected loadPromptResources(
    _channelId: string,
  ): AgentPromptResources | Promise<AgentPromptResources> {
    return {};
  }

  /** Clears any prompt resource cache owned by a subclass. */
  protected invalidatePromptResources(_channelId?: string): void {}

  /** Agent-class behavior prompt, such as a Gmail-specific role. */
  protected getAgentPrompt(_channelId: string): string | undefined {
    return undefined;
  }

  /** Per-subscription user/workspace override. */
  protected getPromptOverride(channelId: string): AgentPromptOverride {
    const config = this.subscriptions.getConfig(channelId);
    const override: AgentPromptOverride = {};
    if (typeof config?.systemPrompt === "string") {
      override.systemPrompt = config.systemPrompt;
    }
    const systemPromptMode = config?.systemPromptMode;
    if (isSystemPromptMode(systemPromptMode)) {
      override.systemPromptMode = systemPromptMode;
    }
    return override;
  }

  /** Final system prompt text for a channel (blob-spilled; its hash rides every
   *  model request descriptor). Keep run-specific volatile instructions out of
   *  this path so provider prompt-cache keys stay stable. */
  protected async composePrompt(channelId: string): Promise<string> {
    const resources = await this.loadPromptResources(channelId);
    const agentPrompt = this.getAgentPrompt(channelId);
    const override = this.getPromptOverride(channelId);
    const composed = composeSystemPrompt({
      ...(resources.workspacePrompt !== undefined
        ? { workspacePrompt: resources.workspacePrompt }
        : {}),
      ...(resources.skillIndex !== undefined
        ? { skillIndex: resources.skillIndex }
        : {}),
      ...(agentPrompt !== undefined ? { agentPrompt } : {}),
      ...(override.systemPrompt !== undefined
        ? { systemPrompt: override.systemPrompt }
        : {}),
      ...(override.systemPromptMode !== undefined
        ? { systemPromptMode: override.systemPromptMode }
        : {}),
    });
    const subagent = this.subagentIdentity();
    return [composed, subagent ? subagentRuntimePrompt(subagent) : ""]
      .filter(Boolean)
      .join("\n\n");
  }

  /** Local tools registered with the local-tool executor. */
  protected getTools(
    _channelId: string,
  ): ToolRegistration[] | Promise<ToolRegistration[]> {
    return [];
  }

  /**
   * Provider-side enforcement for channel participant methods. Descriptors are
   * discovery/UI metadata; subclasses with a reduced control surface must also
   * close the method at the receiver.
   */
  protected isParticipantMethodEnabled(_methodName: string): boolean {
    return true;
  }

  /** Whether this vessel exposes workspace-history search to the model. */
  protected includeMemoryRecallTool(): boolean {
    return true;
  }

  /** Step policies composed onto the pure loop (silent agents, card flows…). */

  /** Test seam: replace effect executors (e.g. inject a scripted model so a
   *  full turn can be driven without a live model). Production returns
   *  undefined — the real executors run. */

  /** Roster method names this agent expects (warning surface only). */
  protected getExpectedChannelToolNames(_channelId: string): readonly string[] {
    return [];
  }

  /** Hook before addressing — return true to swallow the event. */
  protected async onChannelEvent(
    _channelId: string,
    _event: ChannelEvent,
  ): Promise<boolean> {
    return false;
  }

  /** Build the bounded, model-facing form of an opted-in non-chat envelope. */
  protected resolveChannelObservation(
    channelId: string,
    event: ChannelEvent,
  ): ChannelObservationInput | null {
    const serializedPayload = canonicalJson(event.payload);
    const source: ChannelObservationInput["source"] = {
      channelId,
      envelopeId: event.messageId,
      ...(Number.isFinite(event.id) ? { sequence: event.id } : {}),
      payloadKind: event.type,
      timestamp: event.ts,
      sender: participantRefFromMetadata(event.senderId, event.senderMetadata),
    };
    if (serializedPayload.length <= MAX_CHANNEL_OBSERVATION_CHARS) {
      return {
        kind: "channel-observation",
        version: 1,
        source,
        payload: event.payload,
      };
    }
    return {
      kind: "channel-observation",
      version: 1,
      source,
      payload: null,
      truncated: {
        originalChars: serializedPayload.length,
        preview: serializedPayload.slice(
          0,
          MAX_CHANNEL_OBSERVATION_PREVIEW_CHARS,
        ),
      },
    };
  }

  protected getModelCredentialSetupProps(
    _providerId: string,
  ): Record<string, unknown> | null {
    return null;
  }

  /** Provider claims baked into the JWT-shaped sentinel apiKey (e.g.
   *  openai-codex's chatgpt_account_id). Subclass hook; default none. */
  protected getModelCredentialTokenClaims(
    _providerId: string,
    _credential: ModelCredentialSummary,
  ): Record<string, unknown> {
    return {};
  }

  /** Original knowledge-fork product preparation. The receiver has fresh execution storage;
   * this hook runs after canonical membership and before prompt/tool configuration. */
  protected async onChannelForked(_ctx: ClonedChannelContext): Promise<void> {}

  /** Required receiving product preparation, after canonical membership and before model/tool configuration. */
  protected async prepareNativeChannelProduct(
    _channelId: string,
    _config: unknown,
    _fork: ClonedChannelContext | null,
    _context: Context,
  ): Promise<void> {}

  /** Original bootstrap-owned activation after the configured channel can accept genuine native input. */
  protected async activateNativeChannelProduct(
    _channelId: string,
    _context: Context,
  ): Promise<void> {}

  // ── Wiring ────────────────────────────────────────────────────────────────

  protected createChannelClient(
    channelId: string,
    rpc: RpcCaller = this.rpc,
  ): ChannelClient {
    if (rpc !== this.rpc) return new ChannelClient(rpc, channelId);
    let client = this.channelClients.get(channelId);
    if (!client) {
      client = new ChannelClient(this.rpc, channelId);
      this.channelClients.set(channelId, client);
    }
    return client;
  }

  private _identityBootstrapped = false;

  /** Bootstrap identity from the canonical workerd environment. */
  protected ensureIdentity(): void {
    if (this._identityBootstrapped) return;
    const env = this.env as Record<string, string>;
    const source = env["WORKER_SOURCE"];
    const className = env["WORKER_CLASS_NAME"];
    const sessionId = env["WORKERD_SESSION_ID"];
    if (!source || !className || !sessionId) {
      throw new Error(
        "Agent vessel identity requires WORKER_SOURCE, WORKER_CLASS_NAME, and WORKERD_SESSION_ID",
      );
    }
    const generationRaw = env["WORKERD_BOOT_GENERATION"];
    const generation =
      typeof generationRaw === "string" && generationRaw.length > 0
        ? Number.parseInt(generationRaw, 10)
        : null;
    this.identity.bootstrap(
      { source, className, objectKey: this.objectKey },
      sessionId,
      Number.isFinite(generation) ? generation : null,
    );
    this._identityBootstrapped = true;
  }

  protected participantId(): string {
    this.ensureIdentity();
    const ref = this.identity.ref;
    return `do:${ref.source}:${ref.className}:${ref.objectKey}`;
  }

  protected selfRef(channelId: string): ParticipantRef {
    const descriptor = this.getEffectiveParticipantInfo(
      channelId,
      this.subscriptions.getConfig(channelId),
    );
    return {
      kind: "agent",
      id: this.participantId(),
      participantId: this.participantId(),
      displayName: descriptor.name,
      metadata: {
        type: descriptor.type,
        name: descriptor.name,
        handle: descriptor.handle,
      },
    };
  }

  private _gadClient: DurableObjectServiceClient | null = null;

  protected async callGad<T>(method: string, ...args: unknown[]): Promise<T> {
    this._gadClient ??= createGadServiceClient({
      call: <R>(targetId: string, m: string, a: unknown[]) =>
        this.rpc.call<R>(targetId, m, a),
    });
    return this._gadClient.call<T>(method, ...args);
  }

  protected async callGadWith<T>(
    rpc: RpcClient,
    method: string,
    ...args: unknown[]
  ): Promise<T> {
    return createGadServiceClient({
      call: <R>(targetId: string, name: string, values: unknown[]) =>
        rpc.call<R>(targetId, name, values),
    }).call<T>(method, ...args);
  }

  private async channelTarget(channelId: string): Promise<string> {
    const service = await this.rpc.call<{ targetId?: string }>(
      "main",
      "workers.resolveService",
      ["vibestudio.channel.v1", channelId],
    );
    if (!service.targetId) throw new Error("channel service did not resolve");
    return service.targetId;
  }

  // ── Settings (Ref-kind KV; the log journals what each call actually used) ─

  protected async updateSettings(
    patch: StoredSettings,
  ): Promise<AgentSettings> {
    const next = { ...this.storedSettings(), ...patch };
    this.setStateValue(AGENT_SETTINGS_KEY, JSON.stringify(next));
    for (const channelId of this.nativeReasoningChannelIds())
      await this.refreshNativeChannelConfiguration(channelId);
    return this.getAgentSettings();
  }

  /**
   * The agent's settings record (channel-INDEPENDENT). On first read it is
   * seeded from the agent's creation params (`STATE_ARGS.agentConfig`) so an
   * invited agent starts with the config it was created with, then persisted so
   * later reads are stable and edits (updateSettings) win over the seed.
   */
  private storedSettings(persistSeed = true): StoredSettings {
    const raw = this.getStateValue(AGENT_SETTINGS_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as StoredSettings;
      } catch {
        /* corrupt record — fall through to a fresh seed */
      }
    }
    const seed = this.seedSettingsFromStateArgs();
    if (persistSeed && Object.keys(seed).length > 0) {
      this.setStateValue(AGENT_SETTINGS_KEY, JSON.stringify(seed));
    }
    return seed;
  }

  /**
   * Initial settings from the agent's creation stateArgs (`STATE_ARGS.agentConfig`).
   * Picks ONLY the known settings (lenient — skips invalid/unknown keys) so the
   * persisted record stays clean even if the creation config carries presentation
   * fields (handle/systemPrompt) or junk.
   */
  private seedSettingsFromStateArgs(): StoredSettings {
    const stateArgs = this.env["STATE_ARGS"];
    const raw =
      stateArgs && typeof stateArgs === "object"
        ? (stateArgs as Record<string, unknown>)["agentConfig"]
        : undefined;
    if (!raw || typeof raw !== "object") return {};
    const c = raw as Record<string, unknown>;
    const seed: StoredSettings = {};
    if (typeof c["model"] === "string" && c["model"]) seed.model = c["model"];
    const tl = c["thinkingLevel"];
    if (isThinkingLevel(tl)) seed.thinkingLevel = tl;
    if (typeof c["fastMode"] === "boolean") seed.fastMode = c["fastMode"];
    if (typeof c["fallbackModel"] === "string" && c["fallbackModel"]) {
      seed.fallbackModel = c["fallbackModel"];
    }
    if (isThinkingLevel(c["fallbackThinkingLevel"])) {
      seed.fallbackThinkingLevel = c["fallbackThinkingLevel"];
    }
    if (isFallbackOn(c["fallbackOn"])) seed.fallbackOn = [...c["fallbackOn"]];
    if (
      c["fallbackScope"] === "unattended" ||
      c["fallbackScope"] === "all-turns"
    ) {
      seed.fallbackScope = c["fallbackScope"];
    }
    const al = c["approvalLevel"];
    if (al === 0 || al === 1 || al === 2) seed.approvalLevel = al;
    if (isRespondPolicy(c["respondPolicy"]))
      seed.respondPolicy = c["respondPolicy"];
    const rf = c["respondFrom"];
    if (Array.isArray(rf) && rf.every((x) => typeof x === "string"))
      seed.respondFrom = rf as string[];
    return seed;
  }

  private resolveAgentSettings(persistSeed: boolean): AgentSettings {
    const stored = this.storedSettings(persistSeed);
    const approval = stored.approvalLevel;
    return {
      model: stored.model ?? this.getDefaultModel(),
      thinkingLevel: stored.thinkingLevel ?? this.getDefaultThinkingLevel(),
      fastMode: stored.fastMode ?? false,
      ...(stored.fallbackModel ? { fallbackModel: stored.fallbackModel } : {}),
      ...(stored.fallbackThinkingLevel
        ? { fallbackThinkingLevel: stored.fallbackThinkingLevel }
        : {}),
      ...(stored.fallbackOn ? { fallbackOn: [...stored.fallbackOn] } : {}),
      ...(stored.fallbackScope ? { fallbackScope: stored.fallbackScope } : {}),
      approvalLevel:
        approval === 0 || approval === 1 || approval === 2
          ? approval
          : this.getDefaultApprovalLevel(),
      respondPolicy: isRespondPolicy(stored.respondPolicy)
        ? stored.respondPolicy
        : this.getRespondPolicy(),
      respondFrom: stored.respondFrom ?? this.getDefaultRespondFrom(),
    };
  }

  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Ordinary conversation and agent operations use caller-scoped approvals; launched execution retains its authenticated authority.",
    },
    principals: ["host", "user", "code", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  getAgentSettings(): AgentSettings {
    return this.resolveAgentSettings(true);
  }

  /** Settings projection for operational inspection; never seeds local state. */
  private inspectAgentSettings(): AgentSettings {
    return this.resolveAgentSettings(false);
  }

  protected getRespondPolicy(): RespondPolicy {
    return this.getDefaultRespondPolicy();
  }

  /** Materialize the journaled model spec (design §6.2): local refs from the
   *  cached extension entry (refreshed in ensurePromptArtifacts), cloud refs
   *  from the pi-ai registry — an INPUT to materialization here at the impure
   *  edge, never a resolution path in the executor. */
  private materializedModel(
    channelId: string,
    ref: string,
  ): MaterializedModel | null {
    const idx = ref.indexOf(":");
    const providerId = idx === -1 ? "anthropic" : ref.slice(0, idx);
    const modelId = idx === -1 ? ref : ref.slice(idx + 1);
    let localEntry: LocalModelDescriptor | null = null;
    if (providerId === LOCAL_PROVIDER_ID) {
      const raw = this.getStateValue(`agent:localModelEntry:${channelId}`);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as LocalModelDescriptor;
          if (parsed && parsed.slug === modelId) localEntry = parsed;
        } catch {
          // Corrupt cache — the next artifact refresh rewrites it. Only the
          // bundled fallback has a static descriptor before that refresh.
        }
      }
    }
    return materializeModel(providerId, modelId, localEntry);
  }

  /** Cache the local-models extension entry for a `local:*` agent model so
   *  the native configuration can materialize its retained model descriptor. The
   *  bundled fallback has a truthful static descriptor for first boot; every
   *  other local model requires its extension-provided metadata. */
  private async refreshLocalModelEntry(channelId: string): Promise<void> {
    const model = this.getAgentSettings().model;
    if (!model.startsWith(`${LOCAL_PROVIDER_ID}:`)) return;
    const slug = model.slice(LOCAL_PROVIDER_ID.length + 1);
    try {
      const entries = await this.rpc.call<LocalModelDescriptor[]>(
        "main",
        "extensions.invoke",
        [LOCAL_MODELS_EXTENSION_ID, "listModels", []],
      );
      const entry = Array.isArray(entries)
        ? (entries.find((candidate) => candidate?.slug === slug) ?? null)
        : null;
      if (!entry) return;
      this.setStateValue(
        `agent:localModelEntry:${channelId}`,
        JSON.stringify({
          slug: entry.slug,
          displayName: entry.displayName,
          baseUrl: entry.baseUrl,
          contextWindow: entry.contextWindow,
          maxTokens: entry.maxTokens,
          toolsCapable: entry.toolsCapable,
          reasoningCapable: entry.reasoningCapable,
        } satisfies LocalModelDescriptor),
      );
    } catch (err) {
      console.warn("[agent-vessel] local model entry refresh failed:", err);
    }
  }

  /** Refresh the admitted native channel configuration from current prompt,
   * model and tool definitions. Already admitted requests retain their snapshot. */
  protected async ensurePromptArtifacts(channelId: string): Promise<void> {
    await this.refreshNativeChannelConfiguration(channelId);
  }

  /** Last roster snapshot for a channel (set by refreshRoster). */
  protected rosterSnapshot(channelId: string): RosterEntry[] {
    try {
      const raw = this.getStateValue(`agent:roster:${channelId}`);
      return raw ? (JSON.parse(raw) as RosterEntry[]) : [];
    } catch {
      return [];
    }
  }

  /** Conversation-local addressing facts, retained by this vessel. */
  protected conversationAddresseeContext(
    channelId: string,
    metadata?: AgentProductMetadata,
  ): ResolveAddresseeContext {
    const parentParticipantId = this.subagentIdentity()?.parentParticipantId;
    const roster = this.rosterSnapshot(channelId).map(rosterParticipantRef);
    const automationOwnerUserId = metadata?.automation?.ownerUserId;
    const ownerUserId = automationOwnerUserId ?? soleChannelUserId(roster);
    return {
      channelId,
      roster,
      ...(parentParticipantId
        ? { parent: { participantId: parentParticipantId } }
        : {}),
      runs: this.subagentRuns
        .listAll()
        .filter((run) => run.parentChannelId === channelId)
        .map((run) => ({
          runId: run.runId,
          runRef: subagentRunReference(run),
          taskChannelId: run.taskChannelId,
          status: run.status,
          ...(run.childParticipantId
            ? { participantId: run.childParticipantId }
            : {}),
        })),
      ...(ownerUserId ? { ownerUserId } : {}),
    };
  }

  /** Enrich explicit address resolution with workspace directory and people. */
  protected async addresseeContext(
    channelId: string,
    metadata?: AgentProductMetadata,
  ): Promise<ResolveAddresseeContext> {
    const context = this.conversationAddresseeContext(channelId, metadata);
    const [directory, users] = await Promise.all([
      this.agentDirectoryEntries(),
      this.workspaceUserEntries(),
    ]);
    return { ...context, directory, users };
  }

  /** The workspace's people, as addressing sees them (messaging plan §4.2):
   *  the fallback roster for `user:<id>` and `@handle` refs naming someone who
   *  is not on this channel yet. Read live from the host account projection; a
   *  failed read is an empty list, so such refs fail closed with suggestions
   *  from the channel roster rather than failing the message. */
  protected async workspaceUserEntries(): Promise<AddresseeUserEntry[]> {
    try {
      const members = await this.rpc.call<
        Array<{
          userId: string;
          handle?: string;
          displayName?: string;
          revoked?: boolean;
        }>
      >("main", "account.listWorkspaceMembers", []);
      return members
        .filter((member) => member.revoked !== true)
        .map((member) => ({
          userId: member.userId,
          ...(member.handle ? { handle: member.handle } : {}),
          ...(member.displayName ? { displayName: member.displayName } : {}),
        }));
    } catch {
      return [];
    }
  }

  /** The Gad directory as addressing sees it. A directory read that fails is an
   *  empty directory, not a failed message: `agent:` refs then fail closed with
   *  "use discover_agents", which is the same answer a caller gets when the
   *  instance genuinely is not there. */
  protected async agentDirectoryEntries(): Promise<AddresseeDirectoryEntry[]> {
    try {
      const listing = await this.callGad<{
        entries: Array<{
          instanceId: string;
          handle: string | null;
          channelId: string;
          participantId: string;
        }>;
      }>("listAgentDirectory", { includeTerminal: true });
      return listing.entries
        .filter((entry) => entry.handle)
        .map((entry) => ({
          instanceId: entry.instanceId,
          handle: entry.handle as string,
          channelId: entry.channelId,
          participantId: entry.participantId,
        }));
    } catch {
      return [];
    }
  }

  protected createAutomationLaunchTool(
    channelId: string,
    execution?: AgentToolExecutionContext,
  ): ToolRegistration {
    return {
      name: "launch_automation",
      description:
        "Create and immediately start one recurring or manual automation. By default the current agent wakes in this conversation; choose a fresh conversation only for a separate topic or genuinely long-running background task. If shared context would help and wake-ups can be more than one hour apart, ask the user which mode they want when their intent is unclear. A prompt action is an instruction for the future agent, not a final message payload: preserve requested effects such as notifying the owner instead of supplying only the text to send. A watch action runs deterministic code first: return {protocol: 'automation-signal.v1', prompt: null} to finish quietly without a model call, or a nonempty prompt string to continue this run with the agent. The nonempty watch prompt is the future agent's task: preserve requested effects there. For owner notifications, explicitly instruct it to call notify with to: owner and alert: inbox; a final chat reply does not send an inbox notification. Model-facing tools such as notify are available to prompt actions and signaled watch turns, not as eval JavaScript globals. List concrete external service operations known at launch so the host can pre-acquire eligible standing grants; this list is not a runtime allowlist, and omitted authority falls back to ordinary user approval during a run. The running automation is added to this chat as an inspectable pill before the tool returns.",
      parameters: Type.Unsafe<Record<string, JsonValue>>({
        type: "object",
        properties: {
          name: { type: "string", description: "Short automation name." },
          summary: {
            type: "string",
            description: "Plain-language purpose and cadence.",
          },
          action: {
            oneOf: [
              {
                type: "object",
                properties: {
                  kind: { const: "prompt" },
                  text: { type: "string" },
                },
                required: ["kind", "text"],
                additionalProperties: false,
              },
              {
                type: "object",
                properties: {
                  kind: { enum: ["eval", "watch"] },
                  code: { type: "string" },
                  syntax: { enum: ["javascript", "typescript", "jsx", "tsx"] },
                  timeoutMs: { type: "integer", minimum: 1 },
                  reset: { type: "boolean" },
                },
                required: ["kind", "code"],
                additionalProperties: false,
              },
            ],
          },
          trigger: {
            oneOf: [
              {
                type: "object",
                properties: { kind: { const: "manual" } },
                required: ["kind"],
                additionalProperties: false,
              },
              {
                type: "object",
                properties: {
                  kind: { const: "schedule" },
                  everyMs: { type: "integer", minimum: 60000 },
                  anchorAt: { type: "integer", minimum: 0 },
                  jitterMs: { type: "integer", minimum: 0 },
                  untilAt: { type: "integer", minimum: 0 },
                  maxRuns: { type: "integer", minimum: 1 },
                },
                required: ["kind", "everyMs"],
                additionalProperties: false,
              },
              {
                type: "object",
                properties: {
                  kind: { const: "cron" },
                  expression: { type: "string" },
                  timezone: { type: "string" },
                  untilAt: { type: "integer", minimum: 0 },
                  maxRuns: { type: "integer", minimum: 1 },
                },
                required: ["kind", "expression", "timezone"],
                additionalProperties: false,
              },
            ],
          },
          conversation: {
            type: "object",
            description:
              "Where agent wake-ups run. Omit to continue the current agent and conversation. Use fresh only when the automation is a separate topic or intentionally independent background conversation.",
            properties: { mode: { enum: ["fresh", "continue"] } },
            required: ["mode"],
            additionalProperties: false,
          },
          operations: {
            type: "array",
            description:
              "Concrete external service operations reasonably predictable across future runs, used only for launch-time authority acquisition. Include service calls selected by prompt actions as well as calls made by inline eval, but do not translate model-facing tools such as notify into internal service calls; this is not a runtime allowlist.",
            items: {
              type: "object",
              properties: {
                service: { type: "string" },
                method: { type: "string" },
                args: { type: "array" },
                use: { enum: ["action", "conditional"] },
              },
              required: ["service", "method", "use"],
              additionalProperties: false,
            },
          },
        },
        required: ["name", "summary", "action", "trigger"],
        additionalProperties: false,
      }),
      execute: async (params) => {
        if (!execution) {
          throw new Error(
            "launch_automation requires an admitted agent invocation",
          );
        }
        if (execution.metadata?.automation) {
          throw new Error(
            "A scheduled automation cannot launch another automation",
          );
        }
        const automation = await this.launchAutomation(
          channelId,
          params,
          execution.commandId,
          execution.rpc,
        );
        return {
          content: [
            {
              type: "text",
              text: `${automation.name} is running. Its automation pill is now available in this chat.`,
            },
          ],
          details: copyJson(automation, { omitUndefinedProperties: true }),
        };
      },
    };
  }

  protected createAutomationControlTool(
    channelId: string,
    execution?: AgentToolExecutionContext,
  ): ToolRegistration {
    return {
      name: "control_automation",
      description:
        "Control an automation owned by the current user directly. Use pause when the user says stop, disable, or turn it off; pause is reversible and must not be treated as deletion. Use retire only when the user explicitly asks to remove or delete the automation permanently. Do not inspect automation APIs, discover services, or use eval first. Omit the target only when exactly one matching automation is active in this conversation; otherwise pass its exact name or missionId from the launch result or automation pill.",
      parameters: Type.Unsafe<Record<string, JsonValue>>({
        type: "object",
        properties: {
          action: { enum: ["pause", "resume", "run_now", "retire"] },
          missionId: { type: "string" },
          name: { type: "string" },
        },
        required: ["action"],
        additionalProperties: false,
      }),
      execute: async (params) => {
        if (!execution) {
          throw new Error(
            "control_automation requires an admitted agent invocation",
          );
        }
        return this.controlAutomation(
          channelId,
          params,
          execution.commandId,
          execution.rpc,
        );
      },
    };
  }

  private createAutomationCompletionTool(
    channelId: string,
    execution?: AgentToolExecutionContext,
  ): ToolRegistration {
    return {
      name: "complete_automation",
      description:
        "Complete the current recurring automation and prevent future ticks. This is available only inside a scheduled automation turn. Call it when the automation's natural goal is finished; the response is retained in the run and automation history.",
      parameters: Type.Unsafe<Record<string, JsonValue>>({
        type: "object",
        properties: {
          response: {
            type: "string",
            description:
              "Concise final explanation of what completed and why no more ticks are needed.",
          },
        },
        required: ["response"],
        additionalProperties: false,
      }),
      execute: async (params, api, context) => {
        const response = String(
          (params as { response?: unknown }).response ?? "",
        ).trim();
        if (!response)
          throw new Error("complete_automation requires a completion response");
        if (response.length > 24_000) {
          throw new Error(
            "complete_automation response exceeds 24000 characters",
          );
        }
        const automation = execution?.metadata?.automation;
        if (!automation) {
          throw new Error(
            "complete_automation is only available during an automation turn",
          );
        }
        await this.nativeAutomationRuns.recordCompletion(
          api,
          automation.runId,
          channelId,
          response,
          context,
        );
        return {
          content: [
            {
              type: "text",
              text: "Automation completion recorded; no future ticks will be scheduled.",
            },
          ],
          details: { protocol: MISSION_COMPLETION_PROTOCOL, response },
          control: { terminate: true },
        };
      },
    };
  }

  /**
   * Workspace memory search (WS4): chat messages, committed file content, and
   * commit summaries with provenance. The recall result is journaled via the
   * invocation terminal like any tool output — replays and audits see exactly
   * what was recalled.
   */
  private createMemoryRecallTool(
    execution?: AgentToolExecutionContext,
  ): ToolRegistration {
    return {
      name: "memory_recall",
      executionMode: "parallel",
      description:
        "Search workspace memory: past conversation messages, committed file content, and commit summaries. " +
        "Returns snippets with provenance (who/when/where). Use before re-deriving facts that may already be known.",
      parameters: Type.Unsafe<Record<string, JsonValue>>({
        type: "object",
        properties: {
          query: { type: "string", description: "Search terms." },
          kinds: {
            type: "array",
            items: { type: "string", enum: ["message", "file", "commit"] },
            description:
              "Optional filter by memory kind. Commit summaries retain decisions whose text has left current files.",
          },
          limit: {
            type: "number",
            description: "Max results (default 10, max 50).",
          },
        },
        required: ["query"],
      }),
      execute: async (params) => {
        const input = params as {
          query?: unknown;
          kinds?: unknown;
          limit?: unknown;
        };
        if (typeof input.query !== "string" || !input.query.trim()) {
          throw new Error("memory_recall requires a non-empty query");
        }
        if (!execution)
          throw new Error(
            "memory_recall requires an admitted native invocation",
          );
        const recall = await this.callGadWith<{
          results: Array<{
            kind: string;
            snippet: string;
            path: string | null;
            eventId: string | null;
            actor: unknown;
            appendedAt: string | null;
          }>;
        }>(execution.rpc, "recallMemory", {
          query: input.query,
          kinds: Array.isArray(input.kinds)
            ? input.kinds.filter(
                (kind): kind is string => typeof kind === "string",
              )
            : null,
          limit: typeof input.limit === "number" ? input.limit : null,
        });
        const lines = recall.results.map((result) => {
          const where =
            result.path ??
            (result.actor &&
            typeof result.actor === "object" &&
            "id" in result.actor
              ? String((result.actor as { id: unknown }).id)
              : (result.eventId ?? "unknown"));
          const when = result.appendedAt ? ` @ ${result.appendedAt}` : "";
          return `[${result.kind}] ${where}${when}\n${result.snippet}`;
        });
        return {
          content: [
            {
              type: "text" as const,
              text:
                lines.length > 0
                  ? lines.join("\n\n")
                  : "No memory matched the query.",
            },
          ],
          details: { resultCount: recall.results.length },
        };
      },
    };
  }

  // ── Channel membership ───────────────────────────────────────────────────

  // Membership is established by the userland owner that created or acquired
  // the agent. Host lifecycle code can interrupt an active vessel, but does not
  // join it to arbitrary channels on a product service's behalf.
  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Ordinary conversation and agent operations use caller-scoped approvals; launched execution retains its authenticated authority.",
    },
    principals: ["code", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async subscribeChannel(opts: {
    channelId: string;
    contextId: string;
    config?: unknown;
    replay?: boolean;
    delivery?: "all" | "addressed";
  }): Promise<{ ok: boolean; participantId: string }> {
    const context: Context = {
      ...BACKGROUND_CONTEXT,
      abortSignal: this.rpcAbortSignal ?? undefined,
    };
    const subscriptionStartedAt = Date.now();
    this.traceHotPath(opts.channelId, "subscription.started");
    this.ensureIdentity();
    await this.refreshLocalModelEntry(opts.channelId);
    const descriptor = this.getEffectiveParticipantInfo(
      opts.channelId,
      opts.config,
    );
    const subscription = { ...opts, descriptor };
    let result: { ok: boolean; participantId: string };
    if (opts.delivery === "addressed") {
      result = await this.subscriptions.subscribe(subscription);
      await this.prepareNativeChannelProduct(
        opts.channelId,
        this.subscriptions.getConfig(opts.channelId),
        null,
        context,
      );
      await this.activateNativeChannelProduct(opts.channelId, context);
    } else {
      const harness = await this.agentSession(BACKGROUND_CONTEXT);
      const owner = await retainedAgentExecutionOwner(
        harness,
        BACKGROUND_CONTEXT,
      );
      if (opts.contextId !== owner.contextId)
        throw new Error(
          "Reasoning membership must use its actual native owner context",
        );
      const binding = { channelId: opts.channelId, contextId: owner.contextId };
      const retained = await this.nativeChannelBootstrap.retainedIntent(
        harness,
        binding,
        BACKGROUND_CONTEXT,
      );
      const existing = await this.admittedNativeChannelConversation(
        opts.channelId,
      );
      if (retained !== null || existing === null) {
        const intent =
          retained ??
          copyJson(await this.subscriptions.prepareSubscription(subscription), {
            omitUndefinedProperties: true,
          });
        await this.nativeChannelBootstrap.open(
          harness,
          binding,
          intent,
          BACKGROUND_CONTEXT,
        );
        await this.nativeChannelBootstrap.ready(
          harness,
          binding,
          BACKGROUND_CONTEXT,
        );
        // A concurrent membership change follows the original initialization;
        // it cannot rewrite that task's retained request or replay history.
        const originalConfig = this.subscriptions.getConfig(opts.channelId);
        result = await this.subscriptions.subscribe({
          ...subscription,
          replay: false,
        });
        const configured = this.subscriptions.getConfig(opts.channelId);
        if (canonicalJson(originalConfig) !== canonicalJson(configured)) {
          await this.prepareNativeChannelProduct(
            opts.channelId,
            configured,
            null,
            context,
          );
          await this.activateNativeChannelProduct(opts.channelId, context);
        }
        await this.refreshNativeChannelConfiguration(opts.channelId);
      } else {
        result = await this.subscriptions.subscribe(subscription);
        await this.prepareNativeChannelProduct(
          opts.channelId,
          this.subscriptions.getConfig(opts.channelId),
          null,
          context,
        );
        await this.refreshNativeChannelConfiguration(opts.channelId);
        await this.activateNativeChannelProduct(opts.channelId, context);
      }
    }
    this.traceHotPath(opts.channelId, "subscription.completed", {
      startedAt: subscriptionStartedAt,
      details: { replay: opts.replay === true },
    });
    return { ok: result.ok, participantId: result.participantId };
  }

  /** Adopt this concrete vessel's durable queues for one server generation. */

  /**
   * Canonical unattended prompt ingress. The automation registry owns the
   * schedule and run ledger; the agent vessel owns only the ordinary durable
   * turn. `runId` is carried through the journal so the terminal turn can
   * close the exact ledger row without polling the conversation.
   */
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["host", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async runAutomationTurn(input: {
    channelId: string;
    prompt: string;
    automation: NonNullable<AgentProductMetadata["automation"]>;
  }): Promise<void> {
    if (!this.subscriptions.listChannelIds().includes(input.channelId)) {
      throw new Error(
        `Automation channel ${input.channelId} is not subscribed`,
      );
    }
    if (!input.automation.runId || !input.prompt.trim()) {
      throw new Error("Automation turn requires provenance and prompt text");
    }
    await this.nativeAutomationRuns.admitPrompt(
      input.channelId,
      input.prompt,
      input.automation,
      BACKGROUND_CONTEXT,
    );
  }

  /**
   * Canonical model-free automation ingress. The exact revision source is
   * journaled as an ordinary eval invocation and runs in this agent/channel's
   * EvalDO, so ambient `chat` publishes with this agent's durable identity.
   */
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["host", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async runAutomationEval(input: {
    channelId: string;
    automation: NonNullable<AgentProductMetadata["automation"]>;
    eval: {
      code: string;
      syntax?: "javascript" | "typescript" | "jsx" | "tsx";
      timeoutMs?: number;
      reset?: boolean;
    };
  }): Promise<void> {
    if (!this.subscriptions.listChannelIds().includes(input.channelId)) {
      throw new Error(
        `Automation channel ${input.channelId} is not subscribed`,
      );
    }
    if (!input.automation.runId || !input.eval.code.trim()) {
      throw new Error("Automation eval requires provenance and inline code");
    }
    await this.nativeChannelConversation(input.channelId);
    const tools = await this.nativeProductTools(input.channelId);
    const evalTool = tools.find((tool) => tool.name === "eval");
    if (!evalTool)
      throw new Error("Automation requires an actual selected eval tool");
    await this.nativeAutomationRuns.admitEval(
      input.channelId,
      {
        code: input.eval.code,
        ...(input.eval.syntax ? { syntax: input.eval.syntax } : {}),
        ...(input.eval.timeoutMs === undefined
          ? {}
          : { timeoutMs: input.eval.timeoutMs }),
        ...(input.eval.reset ? { reset: true } : {}),
        authority: { approvals: "prompt" },
      },
      bindTool(evalTool, evalTool.executionMode ?? "sequential"),
      input.automation,
      BACKGROUND_CONTEXT,
    );
  }

  /** Receiver-owned evidence for an automation dispatch. This method hydrates
   * the durable channel fold when needed; it never treats activation-local
   * cache absence as evidence that a run is missing. */
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["host", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async describeAutomationRun(input: {
    channelId: string;
    runId: string;
  }): Promise<AutomationExecutorRunStatus> {
    if (!this.subscriptions.listChannelIds().includes(input.channelId)) {
      throw new Error(
        `Automation channel ${input.channelId} is not subscribed`,
      );
    }
    await this.agentSession(BACKGROUND_CONTEXT);
    return this.nativeAutomationRuns.describe(
      input.channelId,
      input.runId,
      BACKGROUND_CONTEXT,
    );
  }

  /** MissionsDO calls this only after its terminal ledger row is durable. A
   * missed acknowledgement merely retains replay evidence; it cannot reopen or
   * duplicate the run. */
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["host", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async acknowledgeAutomationRun(input: {
    channelId: string;
    runId: string;
  }): Promise<void> {
    await this.agentSession(BACKGROUND_CONTEXT);
    await this.nativeAutomationRuns.acknowledge(
      input.channelId,
      input.runId,
      BACKGROUND_CONTEXT,
    );
  }

  // Symmetric with `subscribeChannel`: an owning userland service must be able
  // to detach a vessel during lifecycle cleanup.
  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Ordinary conversation and agent operations use caller-scoped approvals; launched execution retains its authenticated authority.",
    },
    principals: ["user", "code", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async unsubscribeChannel(channelId: string): Promise<{ ok: boolean }> {
    const harness = await this.agentSession(BACKGROUND_CONTEXT);
    const owner = await retainedAgentExecutionOwner(
      harness,
      BACKGROUND_CONTEXT,
    );
    if (this.subscriptions.ownsReasoningLoop(channelId))
      await this.nativeChannelBootstrap.cancel(
        harness,
        { channelId, contextId: owner.contextId },
        BACKGROUND_CONTEXT,
      );
    const conversation =
      await this.admittedNativeChannelConversation(channelId);
    if (conversation)
      await conversation.abort(BACKGROUND_CONTEXT, { background: true });
    await this.reconcileAgentAuthority();
    await this.subscriptions.unsubscribeFromChannel(channelId);
    this.subscriptions.deleteSubscription(channelId);
    return { ok: true };
  }

  // ── Channel intake ───────────────────────────────────────────────────────

  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["host"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async acceptChannelDelivery(
    delivery: ChannelDeliveryInput,
  ): Promise<ChannelDeliveryOutcome> {
    const recipientExecutionStartedAt = Date.now();
    this.ensureIdentity();
    if (delivery.channelRef.objectKey !== delivery.channelId)
      throw new Error("acceptChannelDelivery: channel identity mismatch");
    const providerEnvelope = delivery.envelope as RpcChannelMessage;
    if (
      delivery.participantId === this.participantId() &&
      providerEnvelope.kind === "log" &&
      providerEnvelope.event &&
      (await this.observeDirectMethodTerminal(
        delivery.channelId,
        providerEnvelope.event,
      ))
    ) {
      return {
        deliveryId: delivery.deliveryId,
        disposition: "processed",
        recipientExecutionStartedAt,
      };
    }
    const harness = await this.agentSession();
    const existingDestination = await this.admittedNativeChannelConversation(
      delivery.channelId,
    );
    if (existingDestination)
      await this.awaitNativeChannelReadiness(
        delivery.channelId,
        existingDestination,
        BACKGROUND_CONTEXT,
      );
    const replay = await verifyNativeChannelDeliveryReplay(
      harness,
      delivery,
      BACKGROUND_CONTEXT,
    );
    if (replay) {
      this.reconcileNativeDeliveryProjection(delivery);
      return {
        deliveryId: delivery.deliveryId,
        disposition: "duplicate",
        recipientExecutionStartedAt,
      };
    }
    const stored = this.subscriptions
      .listStored()
      .find((row) => row.channelId === delivery.channelId);
    if (
      !stored ||
      this.subscriptions.getParticipantId(delivery.channelId) !==
        delivery.participantId
    ) {
      if (!stored && delivery.participantId === this.participantId())
        throw Object.assign(
          new Error("Local subscription commit is still pending"),
          {
            code: "SubscriptionCommitPending",
          },
        );
      return {
        deliveryId: delivery.deliveryId,
        disposition: "declined",
        recipientExecutionStartedAt,
      };
    }
    const envelope = delivery.envelope as RpcChannelMessage;
    if (envelope.kind !== "log" || !envelope.event)
      throw Object.assign(
        new Error("Durable delivery requires one canonical log event"),
        {
          code: "PermanentChannelDelivery",
        },
      );
    const methodReceipt = nativeChannelMethodReceiptKey(envelope.event);
    if (methodReceipt)
      await consumeNativeChannelMethodReceipt(
        harness,
        harness,
        methodReceipt,
        this.createChannelClient(delivery.channelId, this.agentRpc),
        BACKGROUND_CONTEXT,
      );
    const context = await this.applyDeliveredAgenticContext(
      delivery.channelId,
      delivery.agenticContext,
    );
    const selection = await this.selectNativeChannelIntake(
      delivery.channelId,
      envelope.event,
      context,
    );
    const admitted = await this.admitNativeChannelDelivery(
      delivery,
      selection.intake,
      BACKGROUND_CONTEXT,
      selection.targetChannelId,
    );
    this.reconcileNativeDeliveryProjection(delivery);
    this.traceHotPath(delivery.channelId, "delivery." + admitted.disposition, {
      source: "channel-delivery",
      itemId: delivery.deliveryId,
    });
    return {
      deliveryId: delivery.deliveryId,
      disposition: admitted.disposition,
      recipientExecutionStartedAt,
    };
  }

  private async selectNativeChannelIntake(
    channelId: string,
    event: ChannelEvent,
    deliveredContext: ChannelAgenticContext,
  ): Promise<NativeChannelSelection> {
    const targetChannelId = this.subscriptions.ownsReasoningLoop(channelId)
      ? channelId
      : this.subagentRuns.getByTaskChannel(channelId)?.parentChannelId;
    if (!targetChannelId)
      throw new Error("Channel delivery has no owned reasoning destination");
    const passive: NativeChannelSelection = {
      targetChannelId,
      intake: {
        kind: "observation",
        entry: {
          kind: "vibestudio.channel-observation",
          data: {
            sourceChannelId: channelId,
            eventId: event.messageId,
            sequence: event.id,
            payloadKind: event.type,
          },
        },
      },
    };
    if (event.type === "presence") this.participantCache.delete(channelId);
    const handled = await this.onChannelEvent(channelId, event);
    const terminal = await this.routeSupervisedTaskTerminal(channelId, event);
    if (terminal) return terminal;
    if (handled) return passive;
    if (event.type !== AGENTIC_EVENT_PAYLOAD_KIND) {
      const observation = this.configuredNativeObservation(channelId, event);
      return observation ? { targetChannelId, intake: observation } : passive;
    }
    const agentic = event.payload as AgenticEvent;
    if (agentic.kind === "ui.feedback") {
      const payload = (agentic as AgenticEvent<"ui.feedback">).payload;
      return payload.target.participantId === this.participantId()
        ? { targetChannelId, intake: { kind: "feedback", payload } }
        : passive;
    }
    if (await this.settleChatOpCall(channelId, event)) return passive;
    if (
      agentic.kind === "message.edited" ||
      agentic.kind === "message.retracted"
    ) {
      if (event.senderId === this.participantId()) return passive;
      return {
        targetChannelId,
        intake:
          agentic.kind === "message.edited"
            ? {
                kind: "message-edit",
                content: this.turnContent(channelId, event),
              }
            : { kind: "message-retract" },
      };
    }
    const wakePolicy =
      this.subscriptions.getConfig(channelId)?.wakePolicy ?? "every-envelope";
    if (wakePolicy !== "every-envelope") {
      if (wakePolicy === "manual") return passive;
      if (
        agentic.kind !== "message.completed" ||
        event.senderId === this.participantId()
      )
        return passive;
      const payload = agentic.payload as {
        saliency?: string;
        mentions?: string[];
        to?: Array<{ kind?: string; participantId?: string }>;
      };
      const run = this.subagentRuns.getByTaskChannel(channelId);
      if (
        payload.saliency === "say" ||
        this.eventAddressesSelf(channelId, payload) ||
        run?.childParticipantId === event.senderId
      )
        return (
          this.nativeExplicitChildReport(channelId, event, agentic) ?? passive
        );
      return passive;
    }
    if (
      agentic.kind !== "message.completed" ||
      event.senderId === this.participantId()
    )
      return passive;
    if (!(await this.shouldRespond(channelId, event, deliveredContext)))
      return passive;
    if (
      typeof agentic.causality?.messageId !== "string" ||
      !agentic.causality.messageId
    )
      throw new Error("Channel input has no canonical source message identity");
    return {
      targetChannelId,
      intake: { kind: "input", content: this.turnContent(channelId, event) },
    };
  }

  private configuredNativeObservation(
    channelId: string,
    event: ChannelEvent,
  ): NativeChannelIntake | null {
    const config = this.subscriptions.getConfig(channelId);
    const observation =
      config?.observations === undefined
        ? null
        : resolveAgentObservationConfig(config.observations);
    if (
      !observation ||
      configuredWakePolicy(config) !== "every-envelope" ||
      !observation.payloadKinds.has(event.type) ||
      event.senderId === this.participantId()
    )
      return null;
    const input = this.resolveChannelObservation(channelId, event);
    return input
      ? {
          kind: "input",
          content:
            "Channel observation: " +
            event.type +
            "\n\n" +
            canonicalJson(input),
        }
      : null;
  }

  /** Explicit cancellation, abandonment, and infrastructure failure facts
   * remain durable task lifecycle events. Ordinary child reports use the
   * normal message and turn lifecycle instead. */
  private async routeSupervisedTaskTerminal(
    channelId: string,
    event: ChannelEvent,
  ): Promise<NativeChannelSelection | null> {
    if (event.type !== AGENTIC_EVENT_PAYLOAD_KIND) return null;
    const agentic = event.payload as AgenticEvent;
    const runId = agentic.causality?.taskId;
    if (typeof runId !== "string") return null;
    const run = this.subagentRuns.get(runId);
    if (
      !run ||
      (run.taskChannelId !== channelId && run.parentChannelId !== channelId)
    )
      return null;
    const terminalStatus = this.authorizedSubagentTerminalStatus(
      run,
      event,
      channelId,
    );
    if (!terminalStatus) {
      console.warn(
        `[agent-vessel] ignoring task terminal for ${runId}: publisher is neither the child nor an authorized supervisor terminal source`,
      );
      return null;
    }
    // Parent publication is the supervisor's resource receipt. A child failure
    // originates in the child's channel and is mirrored before input admission.
    if (channelId === run.taskChannelId)
      await this.mirrorSubagentTerminalToParent(run, event);
    const payload = agentic.payload as Record<string, unknown>;
    const details =
      payload["details"] && typeof payload["details"] === "object"
        ? (payload["details"] as Record<string, unknown>)
        : payload["result"] && typeof payload["result"] === "object"
          ? (((payload["result"] as Record<string, unknown>)["details"] as
              | Record<string, unknown>
              | undefined) ?? {})
          : {};
    if (typeof details["sourceEventId"] === "string") {
      this.subagentRuns.setSourceEventId(runId, details["sourceEventId"]);
    }

    const report =
      typeof payload["summary"] === "string"
        ? payload["summary"]
        : typeof payload["reason"] === "string"
          ? payload["reason"]
          : "";
    this.admittingSubagentTerminals.set(runId, terminalStatus);
    const siblings = this.subagentRuns
      .listAll()
      .filter((candidate) => candidate.parentChannelId === run.parentChannelId)
      .map(
        (candidate) =>
          `- ${candidate.runId} (${candidate.label || "unlabeled"}): ${this.admittingSubagentTerminals.get(candidate.runId) ?? candidate.status}`,
      )
      .join("\n");
    const liveCount = this.subagentRuns
      .listLive()
      .filter(
        (candidate) =>
          candidate.parentChannelId === run.parentChannelId &&
          !this.admittingSubagentTerminals.has(candidate.runId),
      ).length;
    const content = [
      `Subagent "${run.label || runId}" ${terminalStatus}.`,
      report ? `Report:\n${report}` : "",
      "This is a durable terminal result for the existing user request, not a new request.",
      siblings ? `Supervised runs:\n${siblings}` : "",
      liveCount > 0
        ? `${liveCount} other supervised subagent${liveCount === 1 ? " remains" : "s remain"} live. Review this result now, then continue useful foreground work or suspend again.`
        : "No supervised subagents remain live. Review the retained result and continue the user goal. Integrate it only when incorporating the child's work is part of that goal; inspection-only and comparison tasks may deliberately leave it unintegrated.",
    ]
      .filter(Boolean)
      .join("\n\n");
    this.admittingSubagentTerminals.delete(runId);
    return {
      targetChannelId: run.parentChannelId,
      intake: { kind: "input", content, whenBusy: "followUp" },
    };
  }

  /** Deliver an addressing-approved message to the reasoning loop. */

  /** Route a `message.edited` / `message.retracted` channel event to the loop
   *  as an edit/retract command. The fold enforces the author guard and the
   *  read-wins cutoff; here we only skip our own events and require a target. */

  /** Settle our pending channel_call effects from the channel's durable
   *  invocation terminals (the channel broadcasts them to all subscribers,
   *  including us, the caller). This IS the outcome-delivery leg of the
   *  channel_call at-least-once protocol — without it a turn that invokes a
   *  panel method (inline UI, feedback, …) never advances. Duplicate delivery is
   *  a no-op: the outbox row is gone after the first settle. */

  protected turnContent(_channelId: string, event: ChannelEvent): string {
    const agentic = event.payload as { payload?: { blocks?: unknown[] } };
    const content = (agentic.payload?.blocks ?? [])
      .map((block) =>
        block &&
        typeof block === "object" &&
        typeof (block as { content?: unknown }).content === "string"
          ? (block as { content: string }).content
          : "",
      )
      .filter(Boolean)
      .join("\n");
    const interaction = this.turnMetadata(event)?.interaction;
    if (interaction === undefined) return content;
    if (
      !interaction ||
      typeof interaction !== "object" ||
      Array.isArray(interaction) ||
      ["source", "kind", "action", "targetId"].some(
        (field) =>
          typeof interaction[field as keyof typeof interaction] !== "string",
      )
    )
      throw new Error(
        "UI interaction requires source, kind, action and targetId strings",
      );
    // These public user choices accompany this exact native input in model
    // history. Never render transport controls or execution authority metadata.
    const selection = {
      source: interaction.source,
      kind: interaction.kind,
      action: interaction.action,
      targetId: interaction.targetId,
    };
    return [content, `Selected UI interaction:\n${canonicalJson(selection)}`]
      .filter(Boolean)
      .join("\n\n");
  }

  protected turnMetadata(
    event: ChannelEvent,
  ): AgentProductMetadata | undefined {
    const agentic = event.payload as { payload?: { metadata?: unknown } };
    const metadata = agentic.payload?.metadata;
    return metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as AgentProductMetadata)
      : undefined;
  }

  /** The hop depth of the conversation currently being answered on a channel.
   *  Written wherever an inbound event's depth is resolved; read by `notify`
   *  when it stamps a guest envelope. A human message resets the streak to 0
   *  upstream, so this needs no reset of its own. */
  protected recordInboundAgentHops(
    channelId: string,
    hops: number | undefined,
  ): void {
    if (typeof hops !== "number" || !Number.isFinite(hops)) return;
    try {
      this.setStateValue(`agent:inbound-hops:${channelId}`, String(hops));
    } catch {
      /* depth tracking is advisory; never fail delivery over it */
    }
  }

  protected inboundAgentHops(channelId: string): number {
    try {
      const raw = this.getStateValue(`agent:inbound-hops:${channelId}`);
      const value = raw ? Number(raw) : 0;
      return Number.isFinite(value) && value >= 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  protected async shouldRespond(
    channelId: string,
    event: ChannelEvent,
    deliveredContext?: ChannelAgenticContext,
  ): Promise<boolean> {
    const agentic = event.payload as AgenticEvent;
    const payload = (agentic.payload ?? {}) as {
      mentions?: string[];
      replyTo?: string;
      to?: never[];
    };
    const channel = deliveredContext
      ? null
      : this.createChannelClient(channelId);
    let lastCompletedSender: string | null = null;
    let lastCompletedMessageId: string | null = null;
    let replyToSenderId: string | undefined;
    let conversationPolicy: "open" | "directed" | "moderated" | undefined;
    let agentHopLimit: number | undefined;
    let participantIds: string[] = [];
    // Captured for per-agent respondFrom handle→id resolution (resolveRespondFromHandles).
    let respondParticipants: ReadonlyArray<{
      participantId: string;
      metadata?: Record<string, unknown> | null;
    }> = [];
    let agentStreakHops: number | undefined;
    try {
      const resolved = deliveredContext
        ? {
            conversation: deliveredContext.conversation,
            config: deliveredContext.channelConfig,
            participants: deliveredContext.relationships.map(
              (relationship) => ({
                participantId: relationship.participantId,
                metadata: relationship.metadata,
                ref: participantRefFromMetadata(
                  relationship.participantId,
                  relationship.metadata,
                ),
              }),
            ),
            replyToSenderId: deliveredContext.replyToSenderId ?? undefined,
          }
        : await (async () => {
            const [policyState, config, participants] = await Promise.all([
              channel!.getPolicyState(),
              this.getCachedChannelConfig(channelId),
              this.getCachedParticipants(channelId),
            ]);
            return {
              conversation: policyState.state,
              config,
              participants,
              replyToSenderId: payload.replyTo
                ? ((await channel!.getMessageSender(
                    this.participantId(),
                    payload.replyTo,
                  )) ?? undefined)
                : undefined,
            };
          })();
      const conversation = resolved.conversation as {
        lastCompletedSender: string | null;
        lastCompletedMessageId?: string | null;
        lastCompletedSeq: number | null;
        previousCompletedSender: string | null;
        previousCompletedMessageId?: string | null;
        agentStreak?: number;
      };
      // The GAD trajectory fan-out path doesn't run the channel policy annotate,
      // so agent-published rows lack the per-event `agentHops` annotation. The
      // policy's `agentStreak` (folded over every channel row, incl. fan-out) is
      // the equivalent hop count — use it as the fallback so the loop breaker
      // still fires for agent→agent chains.
      if (typeof conversation.agentStreak === "number") {
        agentStreakHops = conversation.agentStreak;
      }
      lastCompletedSender =
        conversation.lastCompletedSeq != null &&
        conversation.lastCompletedSeq === event.id
          ? conversation.previousCompletedSender
          : conversation.lastCompletedSender;
      lastCompletedMessageId =
        conversation.lastCompletedSeq != null &&
        conversation.lastCompletedSeq === event.id
          ? (conversation.previousCompletedMessageId ?? null)
          : (conversation.lastCompletedMessageId ?? null);
      if (
        resolved.config?.["conversationPolicy"] === "open" ||
        resolved.config?.["conversationPolicy"] === "directed" ||
        resolved.config?.["conversationPolicy"] === "moderated"
      ) {
        conversationPolicy = resolved.config["conversationPolicy"];
      }
      if (typeof resolved.config?.["agentHopLimit"] === "number") {
        agentHopLimit = resolved.config["agentHopLimit"];
      }
      participantIds = resolved.participants.map(
        (participant) => participant.participantId,
      );
      respondParticipants = resolved.participants;
      if (payload.replyTo) {
        replyToSenderId =
          resolved.replyToSenderId ??
          (payload.replyTo === lastCompletedMessageId
            ? (lastCompletedSender ?? undefined)
            : undefined);
      }
    } catch {
      /* addressing degrades gracefully without channel state */
    }
    const settings = this.getAgentSettings();
    // respondFrom is per-agent: resolve handle entries to this channel's ids.
    const respondFrom = resolveRespondFromHandles(
      settings.respondFrom,
      respondParticipants,
    );
    const inboundHops =
      (event.annotations?.["agentHops"] as number | undefined) ??
      agentStreakHops;
    // Remember what depth this conversation is at, so a cross-channel `notify`
    // can carry the count over the boundary (plan §4.6, D13). Without this the
    // hop cap is a per-channel fold and an A↔B ping-pong gets twice the depth
    // it should: each channel sees a fresh streak.
    this.recordInboundAgentHops(channelId, inboundHops);
    const taskOwner = this.subagentIdentity();
    const decision = resolveShouldRespond({
      event: {
        senderParticipantId: event.senderId,
        senderKind: agentic.actor?.kind ?? "user",
        mentions: payload.mentions,
        replyTo: payload.replyTo,
        replyToSenderId,
        to: payload.to,
        agentHops: inboundHops,
      },
      self: { participantId: this.participantId() },
      policy: settings.respondPolicy,
      respondFrom,
      participantIds,
      lastCompletedSender,
      conversationPolicy,
      agentHopLimit,
      supervisorParticipantId:
        taskOwner?.taskChannelId === channelId
          ? taskOwner.parentParticipantId
          : undefined,
    });
    if (!decision.respond) {
      console.debug("[agent-vessel] channel input not admitted", {
        channelId,
        envelopeId: event.messageId,
        senderId: event.senderId,
        reason: decision.reason,
      });
    }
    return decision.respond;
  }

  /** Commit the event-sequence roster projection carried by the mailbox row.
   * Recipient admission therefore performs no serialized channel read and the
   * prompt/tool surface is derived from the same relationship fold that chose
   * this recipient. */
  private async applyDeliveredAgenticContext(
    channelId: string,
    context: ChannelAgenticContext,
  ): Promise<ChannelAgenticContext> {
    if (context?.version !== 1) {
      throw Object.assign(
        new Error("acceptChannelDelivery: unsupported agentic context version"),
        {
          code: "PermanentChannelDelivery",
        },
      );
    }
    const relationships =
      context && typeof context === "object"
        ? (context as { relationships?: unknown }).relationships
        : undefined;
    if (
      !Array.isArray(relationships) ||
      !context.conversation ||
      !context.channelConfig
    ) {
      throw Object.assign(
        new Error("acceptChannelDelivery: missing versioned agentic context"),
        {
          code: "PermanentChannelDelivery",
        },
      );
    }
    const selfId = this.participantId();
    const roster: RosterEntry[] = relationships
      .filter(
        (
          value,
        ): value is {
          participantId: string;
          metadata: Record<string, unknown>;
          methodOffers?: import("@workspace/pubsub").MethodAdvertisement[];
        } =>
          !!value &&
          typeof value === "object" &&
          typeof (value as { participantId?: unknown }).participantId ===
            "string" &&
          !!(value as { metadata?: unknown }).metadata &&
          typeof (value as { metadata?: unknown }).metadata === "object",
      )
      .filter(({ participantId }) => participantId !== selfId)
      .map(({ participantId, metadata, methodOffers }) => ({
        participantId,
        ref: participantRefFromMetadata(participantId, metadata),
        handle:
          typeof metadata["handle"] === "string"
            ? String(metadata["handle"])
            : undefined,
        type:
          typeof metadata["type"] === "string"
            ? String(metadata["type"])
            : undefined,
        methods: methodOffers ?? [],
      }));
    const fingerprint = JSON.stringify(roster);
    if (this.getStateValue(`agent:roster:${channelId}`) !== fingerprint) {
      this.setStateValue(`agent:roster:${channelId}`, fingerprint);
      this.participantCache.set(channelId, {
        expiresAt: Date.now() + CHANNEL_STATE_CACHE_MS,
        value: context.relationships.map(({ participantId, metadata }) => ({
          participantId,
          ref: participantRefFromMetadata(participantId, metadata),
          metadata,
        })),
      });
      if (this.subscriptions.ownsReasoningLoop(channelId))
        await this.refreshNativeChannelConfiguration(channelId);
    }
    return context;
  }

  private async getCachedChannelConfig(
    channelId: string,
  ): Promise<Record<string, unknown> | null> {
    const now = Date.now();
    const cached = this.channelConfigCache.get(channelId);
    if (cached && cached.expiresAt > now) return cached.value;
    const value =
      (await this.createChannelClient(channelId).getConfig()) ??
      (this.subscriptions.getConfig(channelId) as Record<
        string,
        unknown
      > | null) ??
      null;
    this.channelConfigCache.set(channelId, {
      value,
      expiresAt: now + CHANNEL_STATE_CACHE_MS,
    });
    return value;
  }

  private async getCachedParticipants(channelId: string): Promise<
    Array<{
      participantId: string;
      ref: ParticipantRef;
      metadata: Record<string, unknown>;
    }>
  > {
    const now = Date.now();
    const cached = this.participantCache.get(channelId);
    if (cached && cached.expiresAt > now) return cached.value;
    const value = await this.createChannelClient(channelId).getParticipants();
    this.participantCache.set(channelId, {
      value,
      expiresAt: now + CHANNEL_STATE_CACHE_MS,
    });
    return value;
  }

  // ── Method calls (agent as PROVIDER) ─────────────────────────────────────

  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async onMethodCall(
    channelId: string,
    transportCallId: string,
    methodName: string,
    args: unknown,
    admission?: { providerClaimGeneration?: number; invocationId?: string },
  ): Promise<{ result: unknown; isError?: boolean }> {
    this.assertChannelDeliveryCaller("onMethodCall", channelId);
    const generation = admission?.providerClaimGeneration;
    const invocationId = admission?.invocationId;
    if (
      !Number.isSafeInteger(generation) ||
      generation! < 1 ||
      typeof invocationId !== "string" ||
      !invocationId
    )
      throw new Error(
        "Method execution requires its actual channel provider claim",
      );
    const originalArgs = args === undefined ? undefined : copyJson(args);
    const client = this.createChannelClient(channelId);
    const isTerminal = async () =>
      !!(await readCanonicalChannelProviderOutcome(client, {
        channelId,
        targetId: this.participantId(),
        invocationId,
        callId: transportCallId,
        method: methodName,
        args: originalArgs,
      }));
    const directCallKey = this.directMethodCallKey(channelId, transportCallId);
    return this.directMethodCalls.run(
      directCallKey,
      canonicalJson({
        channelId,
        transportCallId,
        invocationId,
        generation,
        methodName,
        args: originalArgs,
      }),
      async (signal) => {
        const accepted = await client.markMethodCallExecutionStarted(
          this.participantId(),
          transportCallId,
          generation!,
        );
        if (!accepted.accepted || (await isTerminal()))
          throw new Error("Channel method provider claim is no longer current");
        signal.throwIfAborted();
        return (
          (await this.handleAgentMethodCall(
            channelId,
            methodName,
            originalArgs,
            signal,
            transportCallId,
          )) ?? {
            result: { error: `unknown method: ${methodName}` },
            isError: true,
          }
        );
      },
      isTerminal,
    );
  }

  /** Product method dispatch runs inside the single authenticated, claimed
   * finite operation. Products customize effects here, preserving its signal. */
  protected async handleAgentMethodCall(
    channelId: string,
    methodName: string,
    args: unknown,
    signal: AbortSignal,
    transportCallId: string,
  ): Promise<{ result: unknown; isError?: boolean } | null> {
    return this.handleStandardAgentMethodCall(
      channelId,
      methodName,
      args,
      signal,
      transportCallId,
    );
  }

  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async cancelDirectMethodCall(
    channelId: string,
    transportCallId: string,
  ): Promise<void> {
    this.assertChannelDeliveryCaller("cancelDirectMethodCall", channelId);
    await this.directMethodCalls.cancel(
      this.directMethodCallKey(channelId, transportCallId),
      new Error(`method call cancelled on ${channelId}`),
    );
  }

  /**
   * Operational, activation-local inspection for a channel or the host.
   *
   * This is deliberately separate from `onMethodCall`: inspection is not an
   * agent action and must not enter participant invocation routing. Every read
   * below is in-memory or local SQLite; missing folded state remains explicitly
   * missing instead of being hydrated through GAD.
   */
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    // PubSubChannel performs the admitted, receiver-gated inspection and then
    // reaches this endpoint as an authenticated code principal. The method's
    // exact channel-DO assertion below is the authority boundary for this
    // internal hop; host access remains available for operational inspection.
    principals: ["host", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async readAgentInspection(
    channelId: string,
    methodName: string,
  ): Promise<{ result: unknown; isError?: boolean }> {
    this.assertChannelDeliveryCaller("readAgentInspection", channelId);
    if (!isAgentInspectionMethod(methodName)) {
      throw new Error(
        `readAgentInspection: unsupported method ${methodName}; expected one of ` +
          AGENT_INSPECTION_METHODS.join(", "),
      );
    }
    return this.readStandardAgentInspection(channelId, methodName);
  }

  private async readStandardAgentInspection(
    channelId: string,
    methodName: AgentInspectionMethod,
  ): Promise<{ result: unknown; isError?: boolean }> {
    switch (methodName) {
      case "getDebugState":
        return { result: await this.activationDebugState(channelId) };
      case "getAgentSettings":
        return { result: this.inspectAgentSettings() };
      case "inspectMethodSuspensions":
        return { result: await this.nativeChannelInspection(channelId) };
    }
  }

  /**
   * Journal-derived model route/usage evidence for headless orchestration.
   * This direct RPC remains available when channel presence has already gone
   * stale, which is precisely when timeout/cancellation diagnostics need it.
   * The response contains no prompt, tool argument, credential, or secret.
   */
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async getModelExecutionEvidence(channelId: string): Promise<unknown> {
    // This endpoint reads retained execution truth, not activation-local health.
    // Opening the same bound Session restores its journal without dispatching work.
    const harness = this.existingAgentSession() ?? (await this.agentSession());
    const conversation =
      await this.admittedNativeChannelConversation(channelId);
    if (!conversation)
      return {
        loaded: true,
        channelId,
        conversationId: null,
        observation: "no-admitted-conversation",
      } as const;
    const evidence = await readNativeModelExecutionEvidence(
      harness,
      conversation.id,
      BACKGROUND_CONTEXT,
    );
    return {
      loaded: true,
      channelId,
      ...evidence,
      transportRuntime: modelTransportRuntimeEvidence(),
      hotPathTrace: this.hotPathTrace(channelId),
    };
  }

  /** Direct lifecycle barrier for non-interactive owners. Unlike the chat
   * `pause` method this does not require the controller to remain a channel
   * member while cancellation is already unwinding that membership. */
  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Ordinary conversation and agent operations use caller-scoped approvals; launched execution retains its authenticated authority.",
    },
    principals: ["host", "user", "code", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async interruptChannel(
    channelId: string,
    flushDeferred = false,
  ): Promise<{ interrupted: true }> {
    await this.interruptChannelAndCancelDeferredEvals(channelId, flushDeferred);
    return { interrupted: true };
  }

  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["host"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async interruptAllChannels(
    flushDeferred = true,
  ): Promise<{ interrupted: number }> {
    const channelIds = [
      ...new Set(
        this.subscriptions
          .listAll()
          .map((subscription) => subscription.channelId),
      ),
    ];
    await Promise.all(
      channelIds.map((channelId) =>
        this.interruptChannelAndCancelDeferredEvals(channelId, flushDeferred),
      ),
    );
    return { interrupted: channelIds.length };
  }

  protected async handleStandardAgentMethodCall(
    channelId: string,
    methodName: string,
    args: unknown,
    signal?: AbortSignal,
    transportCallId?: string,
  ): Promise<{ result: unknown; isError?: boolean } | null> {
    if (!this.isParticipantMethodEnabled(methodName)) return null;
    if (isAgentInspectionMethod(methodName)) {
      return this.readStandardAgentInspection(channelId, methodName);
    }
    switch (methodName) {
      case "pause": {
        const flushDeferred =
          (args as { flushDeferred?: unknown } | null)?.flushDeferred === true;
        await this.interruptChannelAndCancelDeferredEvals(
          channelId,
          flushDeferred,
        );
        return { result: { paused: true } };
      }
      case "cancelEval": {
        // The chat-panel pill cancels a SERVER-SIDE eval run by asking THIS agent
        // (the eval's owner, subKey = channelId) to cancel it. The agent calls
        // eval.cancel for itself — the eval service resolves the owner from the
        // caller, so the panel cannot address another owner's EvalDO. The UI
        // supplies the journaled invocation coordinate; this trusted owner
        // derives the distinct eval-effect coordinate used as the run id.
        const invocationId = (args as { invocationId?: unknown } | null)
          ?.invocationId;
        if (typeof invocationId !== "string" || invocationId.length === 0) {
          return {
            result: { error: "cancelEval requires an invocationId" },
            isError: true,
          };
        }
        const runId = invocationId;
        try {
          const result = await this.rpc.call<{ ok: boolean }>(
            "main",
            "eval.cancel",
            [{ scopeKey: channelId, runId }],
            { signal },
          );
          return { result };
        } catch (err) {
          return {
            result: { error: err instanceof Error ? err.message : String(err) },
            isError: true,
          };
        }
      }
      case "resume": {
        await this.submitAgentInitiatedTurn(
          channelId,
          {
            content:
              "Check the conversation and carry on with any outstanding work.",
          },
          {
            steeringId: transportCallId
              ? `method-resume:${transportCallId}`
              : crypto.randomUUID(),
            origin: "agent-initiated",
          },
        );
        return { result: { resumed: true } };
      }
      case "scheduleResumeAtReset": {
        const result = await this.scheduleNativeResumeAtReset(
          channelId,
          (args ?? {}) as { messageId?: unknown; resetAt?: unknown },
        );
        return { result, isError: result.scheduled !== true };
      }
      case "connectModelCredential": {
        const input = (args ?? {}) as {
          providerId?: string;
          method?: string;
          configuration?: Record<string, string>;
          modelRef?: string;
          browserOpenMode?: string;
          modelBaseUrl?: string;
          browserHandoffCallerId?: string;
          browserHandoffCallerKind?: string;
        };
        if (!input.providerId) {
          return {
            result: { error: "connectModelCredential requires providerId" },
            isError: true,
          };
        }
        const browser = normalizeBrowserOpenMode(input.browserOpenMode);
        const request = toCredentialConnectRequest(input.providerId, {
          browser,
          method: input.method,
          configuration: input.configuration,
        });
        if (!request) {
          return {
            result: {
              error: `no credential connect request for provider ${input.providerId}`,
            },
            isError: true,
          };
        }
        const handoffTarget = normalizeBrowserHandoffTarget(input);
        const connectParams:
          | ConnectCredentialRequest
          | ConnectCredentialEnvelope = handoffTarget
          ? { spec: request, handoffTarget }
          : request;
        const credential = await this.rpc.call<Record<string, unknown>>(
          "main",
          "credentials.connect",
          [connectParams],
          { signal },
        );
        const harness = await this.agentSession(BACKGROUND_CONTEXT);
        const owner = await retainedAgentExecutionOwner(
          harness,
          BACKGROUND_CONTEXT,
        );
        const conversation =
          await this.admittedNativeChannelConversation(channelId);
        if (conversation)
          await notifyModelCredentialChange(
            harness,
            owner,
            conversation.id,
            input.providerId,
            BACKGROUND_CONTEXT,
          );
        return { result: { credential, resumed: conversation !== null } };
      }
      case "setModel": {
        const model = (args as { model?: unknown } | null)?.model;
        if (typeof model !== "string" || model.length === 0) {
          return {
            result: {
              error: "setModel requires model in provider:model format",
            },
            isError: true,
          };
        }
        return { result: await this.updateSettings({ model }) };
      }
      case "setThinkingLevel": {
        const level = (args as { level?: unknown } | null)?.level;
        if (
          level !== "minimal" &&
          level !== "low" &&
          level !== "medium" &&
          level !== "high" &&
          level !== "xhigh" &&
          level !== "max"
        ) {
          return {
            result: {
              error:
                "setThinkingLevel requires level: minimal, low, medium, high, xhigh, or max",
            },
            isError: true,
          };
        }
        return { result: await this.updateSettings({ thinkingLevel: level }) };
      }
      case "setFastMode": {
        const enabled = (args as { enabled?: unknown } | null)?.enabled;
        if (typeof enabled !== "boolean") {
          return {
            result: { error: "setFastMode requires enabled: boolean" },
            isError: true,
          };
        }
        return { result: await this.updateSettings({ fastMode: enabled }) };
      }
      case "setApprovalLevel": {
        const level = (args as { level?: unknown } | null)?.level;
        if (level !== 0 && level !== 1 && level !== 2) {
          return {
            result: { error: "setApprovalLevel requires level: 0, 1, or 2" },
            isError: true,
          };
        }
        return { result: await this.updateSettings({ approvalLevel: level }) };
      }
      case "setRespondPolicy": {
        const input = args as { policy?: unknown; from?: unknown } | null;
        if (!isRespondPolicy(input?.policy)) {
          return {
            result: {
              error:
                "setRespondPolicy requires policy: all, mentioned, mentioned-strict, mentioned-or-followup, or from-participants",
            },
            isError: true,
          };
        }
        const from = Array.isArray(input?.from)
          ? input.from.filter((id): id is string => typeof id === "string")
          : undefined;
        return {
          result: await this.updateSettings({
            respondPolicy: input.policy,
            ...(from !== undefined ? { respondFrom: from } : {}),
          }),
        };
      }
      case "refreshPromptArtifacts": {
        this.invalidatePromptResources(channelId);
        await this.ensurePromptArtifacts(channelId);
        return {
          result: {
            refreshed: true,
            systemPromptHash: this.getStateValue(
              `agent:promptHash:${channelId}`,
            ),
            toolSchemasHash: this.getStateValue(`agent:toolsHash:${channelId}`),
          },
        };
      }
      case "getModelExecutionEvidence":
        return { result: await this.getModelExecutionEvidence(channelId) };
      default:
        return null;
    }
  }

  // ── chat proxy for server-side eval (chatOp) ─────────────────────────────

  /**
   * Forwarded channel operation from THIS agent's own EvalDO sandbox `chat`
   * binding. The EvalDO can only publish as its own non-agent identity and
   * cannot receive a delivered method result, so it relays every
   * `ChatSandboxValue` op here and we perform it AS the agent (correct @agent
   * attribution) using our existing channel machinery. Return values mirror
   * `ChatSandboxValue`'s.
   *
   * Auth: the caller MUST be this agent's own EvalDO. We re-derive that DO's
   * objectKey the SAME way evalService does — sha256(ownerId + "\\0" + subKey),
   * hex, first 40 chars — and require the verified caller id to be
   * `do:vibestudio/internal:EvalDO:<key>`. Any other caller is rejected; the
   * generic DO relay is open, so a sensitive receiver gates on receipt.
   */
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async chatOp(
    channelId: string,
    op: string,
    args: unknown[],
  ): Promise<unknown> {
    await this.assertOwnEvalCaller(channelId);
    const channel = this.createChannelClient(channelId);
    const participantId =
      this.subscriptions.getParticipantId(channelId) ?? this.participantId();
    const a = args ?? [];

    switch (op) {
      case "publish": {
        const [eventType, payload, options] = a as [
          string,
          unknown,
          { idempotencyKey?: string } | undefined,
        ];
        const target = await this.channelTarget(channelId);
        return this.rpc.call(target, "publish", [
          participantId,
          eventType,
          payload,
          options?.idempotencyKey
            ? { idempotencyKey: options.idempotencyKey }
            : undefined,
        ]);
      }
      case "send": {
        const [content, options] = a as [
          string,
          { idempotencyKey?: string } | undefined,
        ];
        const messageId = options?.idempotencyKey ?? crypto.randomUUID();
        const descriptor = this.getEffectiveParticipantInfo(
          channelId,
          this.subscriptions.getConfig(channelId),
        );
        await channel.send(participantId, messageId, content, {
          senderMetadata: {
            type: "agent",
            name: descriptor.name,
            handle: descriptor.handle,
          },
          ...(options?.idempotencyKey
            ? { idempotencyKey: options.idempotencyKey }
            : {}),
        });
        return undefined;
      }
      case "publishCustomMessage": {
        const [input, options] = a as [
          {
            typeId: string;
            initialState?: unknown;
            displayMode?: CustomMessageDisplayMode;
          },
          { idempotencyKey?: string } | undefined,
        ];
        // create() mints a fresh card identity (random natural key), publishing
        // custom.started as the agent. The handle carries the pubsubId of that
        // started event — matching the panel client's { messageId, pubsubId }.
        const handle = await this.cards.create(
          channelId,
          input.typeId,
          input.initialState,
          {
            ...(input.displayMode ? { displayMode: input.displayMode } : {}),
            ...(options?.idempotencyKey ? { key: options.idempotencyKey } : {}),
          },
        );
        return { messageId: handle.messageId, pubsubId: handle.pubsubId };
      }
      case "updateCustomMessage": {
        const [messageId, update] = a as [string, unknown];
        const handle = this.cards.get(channelId, messageId);
        if (!handle) {
          throw new Error(
            `updateCustomMessage: no card ${messageId} on channel ${channelId}`,
          );
        }
        // Resolves to the pubsubId of the custom.updated event (number | undefined).
        return handle.update(update);
      }
      case "registerMessageType": {
        const [input] = a as [
          RegisterMessageTypeInput,
          { idempotencyKey?: string } | undefined,
        ];
        const idempotencyKey = (a[1] as { idempotencyKey?: string } | undefined)
          ?.idempotencyKey;
        return this.publishMessageTypeRegistered(
          channelId,
          participantId,
          input,
          idempotencyKey,
        );
      }
      case "clearMessageType": {
        const [typeId] = a as [string, { idempotencyKey?: string } | undefined];
        const idempotencyKey = (a[1] as { idempotencyKey?: string } | undefined)
          ?.idempotencyKey;
        return this.publishMessageTypeCleared(
          channelId,
          participantId,
          typeId,
          idempotencyKey,
        );
      }
      case "getMessageType": {
        const [typeId] = a as [string];
        return channel.getMessageType(typeId);
      }
      case "getMessageTypes":
        return channel.getMessageTypes();
      case "getParticipants":
        return (await channel.getParticipants()).map(
          ({ participantId: id, ref, metadata }) => ({
            id,
            ref,
            type: metadata["type"],
            name: metadata["name"],
            isPerson: metadata["type"] === "user",
            isAgent: metadata["type"] === "agent",
            ...(typeof metadata["handle"] === "string"
              ? { handle: metadata["handle"] }
              : {}),
            ...(Array.isArray(metadata["methods"])
              ? { methods: metadata["methods"] }
              : {}),
          }),
        );
      case "replayEnvelope": {
        const [envelopeId] = a as [string];
        if (typeof envelopeId !== "string" || envelopeId.length === 0)
          return null;
        return channel.getEnvelope(envelopeId);
      }
      case "callMethod": {
        const [targetPid, method, callArgs, options] = a as [
          string,
          string,
          unknown,
          { timeoutMs?: number } | undefined,
        ];
        const result = await this.relayChannelCall(
          channelId,
          targetPid,
          method,
          callArgs,
          options,
        );
        return result.content;
      }
      case "callMethodResult": {
        const [targetPid, method, callArgs, options] = a as [
          string,
          string,
          unknown,
          { timeoutMs?: number } | undefined,
        ];
        return this.relayChannelCall(
          channelId,
          targetPid,
          method,
          callArgs,
          options,
        );
      }
      case "participantByHandle": {
        const [handle] = a as [string];
        return this.resolveParticipantByHandle(channelId, handle);
      }
      case "callMethodByHandle": {
        const [handle, method, callArgs, options] = a as [
          string,
          string,
          unknown,
          { timeoutMs?: number } | undefined,
        ];
        const target = await this.requireParticipantByHandle(channelId, handle);
        const result = await this.relayChannelCall(
          channelId,
          target.id,
          method,
          callArgs,
          options,
        );
        return result.content;
      }
      case "callMethodResultByHandle": {
        const [handle, method, callArgs, options] = a as [
          string,
          string,
          unknown,
          { timeoutMs?: number } | undefined,
        ];
        const target = await this.requireParticipantByHandle(channelId, handle);
        return this.relayChannelCall(
          channelId,
          target.id,
          method,
          callArgs,
          options,
        );
      }
      case "focusMessage":
        // Panel-only DOM scroll; no server-side equivalent.
        return false;
      // ── agent self-management (the eval `agent` binding) ──────────────────
      case "describeSelf":
        return this.describeSelf(channelId);
      case "configureAgent":
        return this.configureAgent((a[0] ?? {}) as Record<string, unknown>);
      default:
        throw new Error(`chatOp: unknown op ${op}`);
    }
  }

  /** Read-only half of the eval owner surface. Keeping this outside chatOp is
   * intentional: chatOp contains mutations and is therefore correctly
   * classified as write, while a self snapshot must remain usable from a
   * read-only eval. The same own-EvalDO receiver check protects both routes. */
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async describeEvalOwner(channelId: string): Promise<Record<string, unknown>> {
    await this.assertOwnEvalCaller(channelId);
    return this.describeSelf(channelId);
  }

  /** Launch the canonical mission first, then publish its idempotent running
   * resource projection. A retry recovers the same mission and the same pill;
   * the tool does not report success until both durable owners acknowledge. */
  /** Host-driven provisioning binds a declared default to this user-owned vessel.
   * It prepares a durable conversation but submits no prompt or model turn. */
  @rpc({
    website: {
      kind: "closed",
      reason: "Only workspace lifecycle may initialize a default automation.",
    },
    principals: ["host"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async initializeAutomation(input: {
    id: string;
    contextId: string;
    definition: unknown;
  }): Promise<MissionRecord> {
    const definition = WorkspaceAutomationSchema.parse(input.definition);
    if (
      definition.source !== this.env["WORKER_SOURCE"] ||
      definition.className !== this.env["WORKER_CLASS_NAME"]
    ) {
      throw new Error(
        "Default automation declaration does not match its executing agent",
      );
    }
    const target = await this.automationServiceTarget(this.rpc);
    const existing = await this.rpc.call<MissionRecord | null>(
      target,
      "getDefault",
      [input.id],
    );
    if (existing) return existing;
    const channelId = this.objectKey;
    await this.rpc.call(
      "main",
      "runtime.createEntity",
      [
        {
          kind: "do",
          execution: { surface: "code", source: "workers/pubsub-channel" },
          className: "PubSubChannel",
          key: channelId,
          contextId: input.contextId,
        },
      ],
      { idempotencyKey: `default-automation:${input.id}:channel` },
    );
    await this.subscribeChannel({
      channelId,
      contextId: input.contextId,
      replay: false,
      delivery: "all",
      config: { name: definition.name },
    });
    // Retain the exact first intent across interruption and template changes.
    const intentKey = `default-automation:${input.id}:intent`;
    let intent = this.getStateValue(intentKey);
    if (!intent) {
      intent = JSON.stringify(
        this.selfAutomationDefinition(channelId, definition),
      );
      this.setStateValue(intentKey, intent);
    }
    return this.rpc.call<MissionRecord>(
      target,
      "provisionDefault",
      [input.id, JSON.parse(intent)],
      { idempotencyKey: `default-automation:${input.id}:provision` },
    );
  }

  private async automationServiceTarget(callerRpc: RpcClient): Promise<string> {
    const service = await callerRpc.call<{
      kind?: unknown;
      targetId?: unknown;
    }>("main", "workers.resolveService", ["vibestudio.missions.v1"]);
    if (
      service.kind !== "durable-object" ||
      typeof service.targetId !== "string"
    ) {
      throw new Error("The Automations service is unavailable");
    }
    return service.targetId;
  }

  private async controlAutomation(
    channelId: string,
    raw: unknown,
    requestIdentity: string,
    callerRpc: RpcClient,
  ): Promise<ToolExecutionResult> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("control_automation requires an object");
    }
    const input = raw as Record<string, unknown>;
    const action = input["action"];
    if (
      action !== "pause" &&
      action !== "resume" &&
      action !== "run_now" &&
      action !== "retire"
    ) {
      throw new Error(
        "control_automation action must be pause, resume, run_now, or retire",
      );
    }
    const requestedMissionId =
      typeof input["missionId"] === "string" ? input["missionId"].trim() : "";
    const requestedName =
      typeof input["name"] === "string" ? input["name"].trim() : "";
    if (requestedMissionId && requestedName) {
      throw new Error("control_automation accepts missionId or name, not both");
    }

    const target = await this.automationServiceTarget(callerRpc);
    const visible = await callerRpc.call<MissionRecord[]>(target, "list", []);
    let candidates = visible;
    if (requestedMissionId) {
      candidates = visible.filter(
        (mission) => mission.missionId === requestedMissionId,
      );
    } else if (requestedName) {
      const normalized = requestedName.toLocaleLowerCase();
      candidates = visible.filter(
        (mission) => mission.name.toLocaleLowerCase() === normalized,
      );
    } else {
      candidates = visible.filter((mission) => {
        const execution = mission.charter.execution;
        return (
          execution.kind === "agent" &&
          execution.conversation.mode === "continue" &&
          execution.conversation.channelId === channelId &&
          (action === "resume"
            ? mission.state === "paused"
            : mission.state === "active")
        );
      });
    }
    if (candidates.length === 0) {
      throw new Error("No matching automation owned by the current user");
    }
    if (candidates.length > 1) {
      throw new Error(
        `More than one automation matches; call control_automation again with one exact name or missionId: ${candidates
          .map((mission) => `${mission.name} (${mission.missionId})`)
          .join(", ")}`,
      );
    }
    const mission = candidates[0]!;
    const method = action === "run_now" ? "runNow" : action;
    const result = await callerRpc.call<unknown>(
      target,
      method,
      [mission.missionId],
      {
        idempotencyKey: `automation:control:${this.objectKey}:${sha256HexSyncText(requestIdentity)}:${action}:${mission.missionId}`,
      },
    );
    const verb =
      action === "pause"
        ? "paused"
        : action === "resume"
          ? "resumed"
          : action === "run_now"
            ? "started"
            : "removed";
    return {
      content: [
        {
          type: "text",
          text: `${mission.name} was ${verb}.`,
        },
      ],
      details: copyJson(result, { omitUndefinedProperties: true }),
    } as ToolExecutionResult;
  }

  private async launchAutomation(
    channelId: string,
    input: unknown,
    requestIdentity: string,
    callerRpc: RpcClient,
  ): Promise<MissionRecord> {
    const definition = this.selfAutomationDefinition(channelId, input);
    if (
      definition.charter.execution.kind === "agent" &&
      definition.charter.execution.conversation.mode === "continue" &&
      definition.charter.execution.operations.length > 0
    ) {
      const authorityPlan = await callerRpc.call<MissionAuthorityPlanReference>(
        "main",
        "authority.compileAuthorityPlan",
        [
          {
            executionImageDigest: missionExecutionImageDigest(
              definition.charter.execution.image,
            ),
            operations: definition.charter.execution.operations.map(
              (operation) => ({
                service: operation.service,
                method: operation.method,
                ...(operation.args ? { args: [...operation.args] } : {}),
                use: operation.use,
              }),
            ),
          },
        ],
        {
          idempotencyKey: `automation:task-authority-plan:${sha256HexSyncText(requestIdentity)}`,
        },
      );
      const authority = await callerRpc.call<MissionAuthorityProjection>(
        "main",
        "authority.acquireForCurrentTask",
        [{ authorityPlanDigest: authorityPlan.digest }],
        {
          idempotencyKey: `automation:task-authority:${sha256HexSyncText(requestIdentity)}`,
        },
      );
      if (authority.denialIds.length > 0) {
        throw new Error(
          "Automation launch was denied required authority for this agent task",
        );
      }
    }
    const target = await this.automationServiceTarget(callerRpc);
    const automation = await callerRpc.call<MissionRecord>(
      target,
      "launch",
      [definition],
      {
        idempotencyKey: `automation:launch:${this.objectKey}:${sha256HexSyncText(requestIdentity)}`,
      },
    );
    if (automation.state !== "active") {
      throw new Error(
        `Automation launch returned unexpected state ${automation.state}`,
      );
    }
    const participantId =
      this.subscriptions.getParticipantId(channelId) ?? this.participantId();
    const descriptor = this.getEffectiveParticipantInfo(
      channelId,
      this.subscriptions.getConfig(channelId),
    );
    const senderMetadata = {
      type: "agent",
      name: descriptor.name,
      handle: descriptor.handle,
    };
    const event: AgenticEvent<"automation.instituted"> = {
      kind: "automation.instituted",
      actor: {
        kind: "agent",
        id: participantId,
        displayName: descriptor.name,
        metadata: senderMetadata,
      },
      payload: {
        protocol: AGENTIC_PROTOCOL_VERSION,
        definition: automationDefinitionSnapshot(automation),
      },
      createdAt: new Date(automation.createdAt).toISOString(),
    };
    await this.createChannelClient(channelId).publishAgenticEvent(
      participantId,
      event,
      {
        idempotencyKey: `automation:instituted:${automation.missionId}`,
        senderMetadata,
      },
    );
    return automation;
  }

  /** Expand the native agent tool input into an exact installed mission
   * charter. Identity and code version come from this executing vessel, never
   * from model-authored strings or a racy build lookup. */
  private selfAutomationDefinition(
    channelId: string,
    raw: unknown,
  ): {
    name: string;
    charter: MissionRecord["charter"];
  } {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("launch_automation requires an object");
    }
    const input = raw as Record<string, unknown>;
    const name = typeof input["name"] === "string" ? input["name"].trim() : "";
    const summary =
      typeof input["summary"] === "string" ? input["summary"].trim() : "";
    if (!name || !summary || !input["action"] || !input["trigger"]) {
      throw new Error(
        "launch_automation requires name, summary, action, and trigger",
      );
    }
    const source = String(this.env["WORKER_SOURCE"] ?? "");
    const className = String(
      this.env["WORKER_CLASS_NAME"] ?? this.constructor.name,
    );
    const ev = String(this.env["WORKER_EFFECTIVE_VERSION"] ?? "");
    const ref = String(this.env["WORKER_SOURCE_REF"] ?? "");
    if (
      !source ||
      !className ||
      !/^[0-9a-f]{64}$/u.test(ev) ||
      !/^state:[0-9a-f]{64}$/u.test(ref)
    ) {
      throw new Error(
        "launch_automation cannot bind this agent to an exact installed build; rebuild the agent runtime",
      );
    }
    const conversationInput = input["conversation"] as
      | { mode?: unknown }
      | undefined;
    if (
      conversationInput?.mode !== undefined &&
      conversationInput.mode !== "fresh" &&
      conversationInput.mode !== "continue"
    ) {
      throw new Error(
        'launch_automation conversation.mode must be "fresh" or "continue"',
      );
    }
    const conversation =
      conversationInput?.mode === "fresh"
        ? { mode: "fresh" as const }
        : {
            mode: "continue" as const,
            channelId,
            contextId: this.subscriptions.getContextId(channelId),
            executorId: this.participantId(),
          };
    const operations = (input["operations"] ?? []) as MissionOperationIntent[];
    return {
      name,
      charter: {
        summary,
        execution: {
          kind: "agent",
          image: {
            source,
            ref: ref as `state:${string}`,
            effectiveVersion: ev,
            className,
            objectKey: this.objectKey,
          },
          action: input["action"] as MissionAgentAction,
          conversation,
          operations,
        },
        trigger: input["trigger"] as MissionTrigger,
      },
    };
  }

  /** Re-derive this agent's own EvalDO objectKey (matching evalService's
   *  formula EXACTLY: sha256(`${ownerId}\0${subKey}`) hex, first 40 chars; owner
   *  = this agent's runtime id, subKey = channelId) and require the verified
   *  caller to be that EvalDO. */
  private async assertOwnEvalCaller(channelId: string): Promise<void> {
    const callerId = this.rpcCallerId;
    const expectedKey = sha256HexSyncText(
      `${this.participantId()}\0${channelId}`,
    );
    const expectedCaller = `do:vibestudio/internal:EvalDO:${expectedKey.slice(0, 40)}`;
    if (callerId !== expectedCaller) {
      throw new Error(
        `chatOp: refusing caller ${callerId ?? "unknown"} — only this agent's own EvalDO may forward chat ops`,
      );
    }
  }

  /** Server-stamped settlement (`onEvalComplete`, authority wake hints): the
   *  server dispatches these via doDispatch / callTarget as callerKind
   *  "server". The DO relay is open, so without this any authenticated caller
   *  could forge a completion or wake and drive the agent loop. */

  /** The channel→agent callback boundary. Effect terminals
   *  (`deliverEffectOutcome`) and method dispatch (`onMethodCall`) arrive from
   *  exactly two legitimate sources: the server
   *  (http_call / credential callbacks, kind "server") and the agent's PubSubChannel
   *  DO (a "do" caller whose id names PubSubChannel). Refuse anything else — the open
   *  relay otherwise lets a panel, a worker, or ANOTHER agent forge channel traffic /
   *  tool outcomes into the loop. callerId is server-authenticated, so the className
   *  segment cannot be spoofed. */
  private directMethodCallKey(
    channelId: string,
    transportCallId: string,
  ): string {
    return `${channelId}\u0000${transportCallId}`;
  }

  private assertChannelDeliveryCaller(
    method: string,
    channelId?: string,
  ): void {
    const kind = this.rpcCallerKind;
    if (kind === "server") return;
    const callerId = this.rpcCallerId ?? "";
    if (
      kind === "do" &&
      typeof channelId === "string" &&
      channelId.length > 0 &&
      callerId === `do:workers/pubsub-channel:PubSubChannel:${channelId}`
    ) {
      return;
    }
    throw new Error(
      `${method}: refusing caller ${callerId || "unknown"} (kind ${kind ?? "unknown"})`,
    );
  }

  /** Publish a messageType.registered event AS the agent (mirrors the ui-install
   *  publisher + the panel client) and invalidate the CardManager type cache. */
  private async publishMessageTypeRegistered(
    channelId: string,
    participantId: string,
    input: RegisterMessageTypeInput,
    idempotencyKey?: string,
  ): Promise<number | undefined> {
    // Self-gate: this helper is independently RPC-exposed (collectExposableMethods
    // reflects every method) over the open DO relay, so chatOp's assertOwnEvalCaller
    // is bypassable by addressing it directly. Only this agent's own EvalDO may act
    // as the agent.
    await this.assertOwnEvalCaller(channelId);
    const actor = this.cardActor(channelId, participantId);
    const event: AgenticEvent<"messageType.registered"> = {
      kind: "messageType.registered",
      actor,
      payload: {
        protocol: AGENTIC_PROTOCOL_VERSION,
        typeId: input.typeId,
        displayMode: input.displayMode,
        source: input.source,
        ...(input.imports !== undefined ? { imports: input.imports } : {}),
        ...(input.stateSchema !== undefined
          ? { stateSchema: input.stateSchema }
          : {}),
        ...(input.updateSchema !== undefined
          ? { updateSchema: input.updateSchema }
          : {}),
        registeredBy: actor,
      },
      createdAt: new Date().toISOString(),
    };
    const res = await this.createChannelClient(channelId).publishAgenticEvent(
      participantId,
      event,
      {
        ...(idempotencyKey ? { idempotencyKey } : {}),
        senderMetadata: actor.metadata,
      },
    );
    this.cards.invalidateType(channelId, input.typeId);
    return res.id;
  }

  /** Publish a messageType.cleared tombstone AS the agent + invalidate cache. */
  private async publishMessageTypeCleared(
    channelId: string,
    participantId: string,
    typeId: string,
    idempotencyKey?: string,
  ): Promise<number | undefined> {
    await this.assertOwnEvalCaller(channelId); // direct-call gate — see publishMessageTypeRegistered
    const actor = this.cardActor(channelId, participantId);
    const event: AgenticEvent<"messageType.cleared"> = {
      kind: "messageType.cleared",
      actor,
      payload: { protocol: AGENTIC_PROTOCOL_VERSION, typeId },
      createdAt: new Date().toISOString(),
    };
    const res = await this.createChannelClient(channelId).publishAgenticEvent(
      participantId,
      event,
      {
        ...(idempotencyKey ? { idempotencyKey } : {}),
        senderMetadata: actor.metadata,
      },
    );
    this.cards.invalidateType(channelId, typeId);
    return res.id;
  }

  private cardActor(
    channelId: string,
    participantId: string,
  ): ActorRef & { participantId?: string; metadata?: Record<string, unknown> } {
    const descriptor = this.getEffectiveParticipantInfo(
      channelId,
      this.subscriptions.getConfig(channelId),
    );
    return {
      kind: "agent",
      id: participantId,
      displayName: descriptor.name,
      participantId,
      metadata: {
        type: "agent",
        name: descriptor.name,
        handle: descriptor.handle,
      },
    };
  }

  /** Resolve a participant by handle ("handle" or "@handle") from the channel
   *  roster. Returns the raw participant record (id + metadata) or null. */
  private async resolveParticipantByHandle(
    channelId: string,
    rawHandle: string,
  ): Promise<{ id: string; metadata: Record<string, unknown> } | null> {
    const handle = rawHandle.startsWith("@") ? rawHandle.slice(1) : rawHandle;
    const participants = await this.getCachedParticipants(channelId);
    const match = participants.find((p) => p.metadata?.["handle"] === handle);
    return match ? { id: match.participantId, metadata: match.metadata } : null;
  }

  private async requireParticipantByHandle(
    channelId: string,
    rawHandle: string,
  ): Promise<{ id: string; metadata: Record<string, unknown> }> {
    const participant = await this.resolveParticipantByHandle(
      channelId,
      rawHandle,
    );
    if (!participant) {
      const handle = rawHandle.startsWith("@") ? rawHandle.slice(1) : rawHandle;
      throw new Error(`No participant with handle @${handle}`);
    }
    return participant;
  }

  /**
   * Initiate a channel method call AS the agent and resolve to the DELIVERED
   * result. The channel broadcasts the durable invocation terminal back to us
   * (the caller); settleChatOpCall matches it by transportCallId and resolves
   * the promise registered here. Loop-independent (does not touch the
   * native invocation) so the eval relay returns the result inline.
   */
  private async relayChannelCall(
    channelId: string,
    targetPid: string,
    method: string,
    args: unknown,
    options?: { timeoutMs?: number },
  ): Promise<{ content: unknown }> {
    await this.assertOwnEvalCaller(channelId); // direct-call gate — see publishMessageTypeRegistered
    if (
      typeof targetPid !== "string" ||
      !targetPid ||
      typeof method !== "string" ||
      !method ||
      args === undefined
    )
      throw new TypeError(
        "chat.callMethod requires (participantId: string, method: string, args: JSON value)",
      );
    // An eval running inside this agent can inspect the agent itself, but a
    // channel relay to our own participant would wait for a result from the
    // turn that is currently waiting on that relay. Resolve the documented
    // read-only inspection methods locally; all other self-calls retain the
    // normal channel semantics.
    if (targetPid === this.participantId() && isAgentInspectionMethod(method)) {
      const inspection = await this.readStandardAgentInspection(
        channelId,
        method,
      );
      return { content: inspection.result };
    }
    const callId = crypto.randomUUID();
    const controller = new AbortController();
    return this.channelMethodRelays.call({
      request: {
        channelId,
        callerId: this.participantId(),
        targetIds: [targetPid],
        method,
        args: copyJson(args),
      },
      route: { targetId: targetPid, invocationId: callId, callId },
      dispatch: this.createChannelClient(
        channelId,
        withRpcAbortSignal(this.rpc, controller.signal),
      ),
      cleanup: this.createChannelClient(channelId, this.agentRpc),
      dispatchController: controller,
      callerSignal: this.rpcAbortSignal,
      ...(options?.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      hydrate: (value) =>
        this.hydrateTransportValue(
          value,
          channelId,
          targetPid,
          "chat-method-result",
        ),
    });
  }

  /** Delivery is readiness only; the owned relay rereads its canonical route. */
  /** A canonical provider terminal is finite-operation lifecycle work, not
   * reasoning input. It is consumed before opening an agent session. */
  private async observeDirectMethodTerminal(
    channelId: string,
    event: ChannelEvent,
  ): Promise<boolean> {
    if (event.type !== AGENTIC_EVENT_PAYLOAD_KIND) return false;
    const terminal = event.payload as {
      kind?: unknown;
      causality?: { transportCallId?: unknown; invocationId?: unknown };
    };
    if (
      !(
        terminal.kind === "invocation.completed" ||
        terminal.kind === "invocation.failed" ||
        terminal.kind === "invocation.cancelled" ||
        terminal.kind === "invocation.abandoned"
      ) ||
      typeof terminal.causality?.transportCallId !== "string" ||
      typeof terminal.causality.invocationId !== "string"
    )
      return false;
    if (
      await this.directMethodCalls.observeTerminal(
        this.directMethodCallKey(channelId, terminal.causality.transportCallId),
      )
    )
      return true;
    // A replacement has no activation-local dedup record. The canonical start
    // still proves that this is this provider's original terminal, so replay
    // does not manufacture a native conversation or autonomous checkup.
    return !!(await readCanonicalChannelProviderTerminal(
      this.createChannelClient(channelId),
      {
        channelId,
        targetId: this.participantId(),
        invocationId: terminal.causality.invocationId,
        callId: terminal.causality.transportCallId,
      },
    ));
  }

  private async settleChatOpCall(
    channelId: string,
    event: ChannelEvent,
  ): Promise<boolean> {
    return this.channelMethodRelays.hint(channelId, event);
  }

  /** Abort and join the original native conversation, including its owned tools,
   * then reconcile retained host authority receipts. */
  private async interruptChannelAndCancelDeferredEvals(
    channelId: string,
    flushDeferred: boolean,
  ): Promise<void> {
    await this.agentSession(BACKGROUND_CONTEXT);
    const conversation =
      await this.admittedNativeChannelConversation(channelId);
    if (conversation) {
      if (flushDeferred) await conversation.flush(BACKGROUND_CONTEXT);
      else await conversation.abort(BACKGROUND_CONTEXT, { background: true });
    }
    await this.reconcileAgentAuthority();
  }

  /**
   * Streamed eval console — the rolling-output sibling of `onEvalComplete`. The agent's eval runs in
   * a server-side EvalDO; during the run the EvalDO forwards buffered console chunks here (gated
   * by `assertOwnEvalCaller`, exactly like the `chat` binding's `chatOp` — only this agent's own
   * EvalDO may act as it). Each chunk is published as an `invocation.output` event keyed to the eval
   * parent tool invocation (`agentInvocationId`), independently of the eval effect's `runId`, so the
   * chat panel renders the console live AND persists it for the card's details view. Best-effort: a
   * dropped chunk is just a gap in the live console — the
   * final result still carries the full console text. Ordering: the EvalDO awaits its final flush
   * before completing, so every output precedes the `invocation.completed` terminal (the reducer drops
   * output after terminal).
   */
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async onEvalProgress(payload: {
    runId: string;
    agentInvocationId: string;
    channelId: string;
    output?: string;
    activity?: {
      kind: "authority-requested" | "authority-decided";
      detail?: unknown;
    };
  }): Promise<void> {
    await this.assertOwnEvalCaller(payload.channelId);
    if (payload.activity) {
      const detail =
        payload.activity.detail && typeof payload.activity.detail === "object"
          ? (payload.activity.detail as Record<string, unknown>)
          : {};
      const capability =
        typeof detail["capability"] === "string"
          ? detail["capability"]
          : undefined;
      const resourceKey =
        typeof detail["resourceKey"] === "string"
          ? detail["resourceKey"]
          : undefined;
      const waiting = payload.activity.kind === "authority-requested";
      const message = waiting
        ? `Waiting for approval${capability ? ` to use ${capability}` : ""}${resourceKey ? ` on ${resourceKey}` : ""}`
        : "Approval decision received; resuming eval";
      const participantId =
        this.subscriptions.getParticipantId(payload.channelId) ??
        this.participantId();
      const actor = this.cardActor(payload.channelId, participantId);
      const event: AgenticEvent<"invocation.progress"> = {
        kind: "invocation.progress",
        actor,
        causality: { invocationId: payload.agentInvocationId as never },
        payload: {
          protocol: AGENTIC_PROTOCOL_VERSION,
          message,
          data: {
            eval: {
              runId: payload.runId,
              activity: waiting ? "authority-pending" : "executing",
              detail: payload.activity.detail,
            },
          },
        },
        createdAt: new Date().toISOString(),
      };
      await this.createChannelClient(payload.channelId).publishAgenticEvent(
        participantId,
        event,
        {
          senderMetadata: actor.metadata,
        },
      );
      return;
    }
    if (!payload.output) return;
    const participantId =
      this.subscriptions.getParticipantId(payload.channelId) ??
      this.participantId();
    const actor = this.cardActor(payload.channelId, participantId);
    const event: AgenticEvent<"invocation.output"> = {
      kind: "invocation.output",
      actor,
      causality: { invocationId: payload.agentInvocationId as never },
      payload: {
        protocol: AGENTIC_PROTOCOL_VERSION,
        output: payload.output,
        channel: "stdout",
      },
      createdAt: new Date().toISOString(),
    };
    await this.createChannelClient(payload.channelId).publishAgenticEvent(
      participantId,
      event,
      {
        senderMetadata: actor.metadata,
      },
    );
  }

  /**
   * Settle the exact eval effect addressed by `runId`. Parent invocation
   * identity is carried separately for causality and never reconstructed from
   * the effect id. Duplicate settlement is an idempotent driver no-op.
   */

  // ── Custom message recovery (CardManager read path) ─────────────────────

  /** Fold this agent's own custom messages from the channel log:
   *  Map<typeId, Map<messageId, state>> with card reducers applied. Used by
   *  card-owning agents to recover live card state after hibernation/fork. */
  protected async indexOwnCustomMessages(
    channelId: string,
    reducerLookup?: (typeId: string) => CustomMessageReducer | undefined | null,
    rpc: RpcClient = this.rpc,
  ): Promise<Map<string, Map<string, unknown>>> {
    const selfParticipantId = this.subscriptions.getParticipantId(channelId);
    if (!selfParticipantId) return new Map();

    const byMessageId = new Map<string, { typeId: string; state: unknown }>();
    const channel = this.createChannelClient(channelId, rpc);
    for await (const envelope of iterateChannelReplayAfterPages(
      (request) => channel.getReplayAfter(request),
      { after: 0 },
    )) {
      const events = envelope.logEvents;
      for (const event of events) {
        if (event.type !== AGENTIC_EVENT_PAYLOAD_KIND) continue;
        const agentic = event.payload as {
          kind?: string;
          actor?: { id?: string; participantId?: string };
          payload?: Record<string, unknown>;
        } | null;
        const actor = agentic?.actor;
        if (
          actor?.participantId !== selfParticipantId &&
          actor?.id !== selfParticipantId
        ) {
          continue;
        }
        const payload = agentic?.payload ?? {};
        if (agentic?.kind === "custom.started") {
          const messageId =
            typeof payload["messageId"] === "string"
              ? payload["messageId"]
              : null;
          const typeId =
            typeof payload["typeId"] === "string" ? payload["typeId"] : null;
          if (!messageId || !typeId) continue;
          byMessageId.set(messageId, {
            typeId,
            state: await this.hydrateTransportValue(
              payload["initialState"],
              undefined,
              undefined,
              "card-recovery",
              rpc,
            ),
          });
          continue;
        }
        if (agentic?.kind === "custom.updated") {
          const messageId =
            typeof payload["messageId"] === "string"
              ? payload["messageId"]
              : null;
          if (!messageId) continue;
          const existing = byMessageId.get(messageId);
          if (!existing) continue;
          const reducer = reducerLookup?.(existing.typeId) ?? null;
          const update = await this.hydrateTransportValue(
            payload["update"],
            undefined,
            undefined,
            "card-recovery",
            rpc,
          );
          byMessageId.set(messageId, {
            typeId: existing.typeId,
            state: reducer ? reducer(existing.state, update) : update,
          });
        }
      }
    }

    const byType = new Map<string, Map<string, unknown>>();
    for (const [messageId, { typeId, state }] of byMessageId.entries()) {
      let messages = byType.get(typeId);
      if (!messages) {
        messages = new Map();
        byType.set(typeId, messages);
      }
      messages.set(messageId, state);
    }
    return byType;
  }

  private async hydrateTransportValue(
    value: unknown,
    channelId?: string | null,
    originSessionId?: string | null,
    via = "channel-value-hydration",
    rpc: RpcClient = this.rpc,
  ): Promise<unknown> {
    // A result authored by another session is outside content: the standing
    // task authority goes before its bytes reach the model.
    if (channelId && originSessionId)
      await this.outsideContentReset(channelId).observe(
        `${via}:${originSessionId}`,
      );
    return hydrateStoredValueRefs(value, {
      getText: (digest) =>
        rpc.call<string | null>("main", "blobstore.getText", [digest]),
    });
  }

  /**
   * Outside content reached this task, so its standing authority goes.
   *
   * Channel and cross-session content originate inside the workspace, so they
   * are not outside content and do not reset anything. Only content the
   * workspace fetched from beyond it does — see `outside-content-reset`.
   */
  private readonly outsideContentResets = new Map<
    string,
    OutsideContentReset
  >();

  /** One reset latch per channel: the first outside source in a task revokes
   *  its standing grants, and later sources on the same key are no-ops. */
  private outsideContentReset(channelId: string): OutsideContentReset {
    const existing = this.outsideContentResets.get(channelId);
    if (existing) return existing;
    const created = createOutsideContentReset({
      resetTaskAuthority: () =>
        this.resetTaskAuthorityForOutsideContent(channelId),
    });
    this.outsideContentResets.set(channelId, created);
    return created;
  }

  protected async resetTaskAuthorityForOutsideContent(
    channelId: string,
  ): Promise<void> {
    const contextId = this.subscriptions.getContextId(channelId);
    if (!contextId) return;
    await this.rpc.call("main", "authority.resetTaskRules", [
      { contextId, channelId },
    ]);
  }

  // ── Subclass conveniences ────────────────────────────────────────────────

  /** Whether a channel event is a client-authored completed message. */
  protected shouldProcess(event: ChannelEvent): boolean {
    if (event.type !== AGENTIC_EVENT_PAYLOAD_KIND) return false;
    if (event.senderId === this.participantId()) return false;
    const agentic = event.payload as { kind?: string } | null;
    return agentic?.kind === "message.completed";
  }

  /** Plain-text turn input extracted from a channel event. */
  protected buildTurnInput(event: ChannelEvent): { content: string } {
    const agentic = event.payload as {
      payload?: { blocks?: unknown[] };
    } | null;
    const blocks = agentic?.payload?.blocks ?? [];
    const content = blocks
      .map((block) =>
        block &&
        typeof block === "object" &&
        typeof (block as { content?: unknown }).content === "string"
          ? (block as { content: string }).content
          : "",
      )
      .filter(Boolean)
      .join("\n");
    return { content };
  }

  /** Journal an agent-initiated prompt (digest turns, onboarding nudges).
   *  `steeringId` keys the deterministic turn identity — re-submission with
   *  the same id is a replay no-op all the way down. */
  protected async submitAgentInitiatedTurn(
    channelId: string,
    input: { content: string },
    opts?: AgentInitiatedTurnOptions,
    context: Context = BACKGROUND_CONTEXT,
  ): Promise<void> {
    const conversation = await this.nativeChannelConversation(
      channelId,
      context,
    );
    await conversation.submit(
      {
        type: "input",
        requestId: opts?.steeringId ?? crypto.randomUUID(),
        whenBusy: opts?.deliverAfterTurn ? "followUp" : "steer",
        content: async (tx, submissionId) => {
          await recordNativeProductInput(tx, submissionId, channelId, opts);
          await recordNativeChannelInputAdmission(
            tx,
            conversation.id,
            submissionId,
          );
          return input.content;
        },
      },
      context,
    );
  }

  /** Resolve the current model's API key (out-of-loop helpers like draft
   *  writers). When no credential is configured, publishes a connect-only
   *  credential card (resumeAfterConnect: false — one-shot flows have no
   *  parked turn to resume) and throws with the canonical message. */
  private readonly nativeHelperConnections =
    new Set<CredentialedModelConnection>();
  private readonly nativeHelperOperations = new Set<{
    controller: AbortController;
    operation: Promise<unknown>;
  }>();

  protected async withNativeModelConnection<T>(
    channelId: string,
    selected: Model<Api>,
    dispatch: (
      model: Model<Api>,
      connection: CredentialedModelConnection,
    ) => Promise<T>,
    context: Context = {
      ...BACKGROUND_CONTEXT,
      abortSignal: this.rpcAbortSignal ?? undefined,
    },
    rpc: RpcClient = this.rpc,
  ): Promise<T> {
    await this.agentSession(context);
    this.assertNativeAgentAdmission();
    const controller = new AbortController();
    const abortSignal = context.abortSignal
      ? AbortSignal.any([context.abortSignal, controller.signal])
      : controller.signal;
    const operation = Promise.resolve().then(() =>
      withPreparedNativeModel(
        {
          rpc,
          egressFetch: fetch,
          own: (connection) => {
            this.nativeHelperConnections.add(connection);
          },
          released: (connection) => {
            this.nativeHelperConnections.delete(connection);
          },
          credentialMissing: (model) =>
            this.publishCredentialConnectCard(
              channelId,
              model.provider,
              {
                resumeAfterConnect: false,
                modelRef: `${model.provider}:${model.id}`,
              },
              rpc,
            ),
        },
        selected,
        dispatch,
        { ...context, abortSignal },
      ),
    );
    const owned = { controller, operation };
    this.nativeHelperOperations.add(owned);
    try {
      return await operation;
    } finally {
      this.nativeHelperOperations.delete(owned);
    }
  }

  private async releaseNativeModelHelpers(reason: Error): Promise<void> {
    const operations = [...this.nativeHelperOperations];
    for (const { controller } of operations) controller.abort(reason);
    await Promise.allSettled(operations.map(({ operation }) => operation));
    const outcomes = await Promise.allSettled(
      [...this.nativeHelperConnections].map(async (connection) => {
        await connection.close(BACKGROUND_CONTEXT);
        this.nativeHelperConnections.delete(connection);
      }),
    );
    const failures = outcomes
      .filter(
        (outcome): outcome is PromiseRejectedResult =>
          outcome.status === "rejected",
      )
      .map((outcome) => outcome.reason);
    if (failures.length === 1) throw failures[0];
    if (failures.length)
      throw new AggregateError(
        failures,
        "One-shot model resource cleanup failed",
        {
          cause: failures[0],
        },
      );
  }

  /** The credential-connect inline card (same renderer the chat panel ships). */
  protected async publishCredentialConnectCard(
    channelId: string,
    providerId: string,
    opts: { resumeAfterConnect: boolean; reason?: string; modelRef?: string },
    rpc: RpcClient = this.rpc,
  ): Promise<void> {
    const participantId =
      this.subscriptions.getParticipantId(channelId) ?? this.participantId();
    const cardId = `model-credential-${providerId}:${channelId}`;
    const event: AgenticEvent<"ui.inline_rendered"> = {
      kind: "ui.inline_rendered",
      actor: { kind: "agent", id: participantId, displayName: participantId },
      payload: {
        protocol: "agentic.trajectory.v1",
        uiType: "inline",
        id: cardId,
        source: {
          type: "file",
          path: "packages/agentic-chat/components/ModelCredentialRequiredCard.tsx",
        },
        props: {
          providerId,
          modelRef: opts.modelRef ?? this.getAgentSettings().model,
          agentParticipantId: participantId,
          resumeAfterConnect: opts.resumeAfterConnect,
          ...(opts.reason ? { reason: opts.reason } : {}),
          ...(this.getModelCredentialSetupProps(providerId) ?? {}),
        },
      },
      createdAt: new Date().toISOString(),
    };
    await this.createChannelClient(channelId, rpc).publishAgenticEvent(
      participantId,
      event,
      {
        idempotencyKey: cardId,
        senderMetadata: { type: "agent", name: participantId },
      },
    );
  }

  // ── Fork ─────────────────────────────────────────────────────────────────

  /** Per-channel fork preflight. Vets ONLY the named subscription (it must
   *  exist); a multi-channel agent forks the one channel and drops the rest in
   *  the clone (see {@link postClone}), so the old ≤1-subscription gate is gone. */
  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Ordinary conversation and agent operations use caller-scoped approvals; launched execution retains its authenticated authority.",
    },
    principals: ["host", "code", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async canFork(channelId: string): Promise<{ ok: boolean; reason?: string }> {
    if (!this.subscriptions.getParticipantId(channelId)) {
      return { ok: false, reason: `no subscription for channel ${channelId}` };
    }
    return { ok: true };
  }

  protected exportNativeChannelKnowledgeConfiguration(
    _channelId: string,
  ): JsonValue {
    return null;
  }

  protected async restoreNativeChannelKnowledgeConfiguration(
    _channelId: string,
    configuration: JsonValue,
  ): Promise<void> {
    if (configuration !== null)
      throw new Error("This agent cannot restore foreign domain configuration");
  }

  /** Immutable original settings composition; domain hooks never carry execution storage. */
  protected exportNativeAgentKnowledgeConfiguration(
    channelId: string,
  ): JsonValue {
    return copyJson(
      {
        kind: "vibestudio.agent-configuration",
        agentSettings: this.getAgentSettings(),
        domain: this.exportNativeChannelKnowledgeConfiguration(channelId),
      },
      { omitUndefinedProperties: true },
    );
  }

  protected async restoreNativeAgentKnowledgeConfiguration(
    channelId: string,
    configuration: JsonValue,
  ): Promise<void> {
    if (configuration !== null) {
      if (
        typeof configuration !== "object" ||
        Array.isArray(configuration) ||
        configuration["kind"] !== "vibestudio.agent-configuration" ||
        !configuration["agentSettings"] ||
        typeof configuration["agentSettings"] !== "object" ||
        Array.isArray(configuration["agentSettings"]) ||
        !("domain" in configuration)
      )
        throw new Error(
          "Imported agent configuration is not its original typed settings",
        );
      const settings = this.validatedSettings(configuration["agentSettings"]);
      this.setStateValue(AGENT_SETTINGS_KEY, JSON.stringify(settings));
      await this.restoreNativeChannelKnowledgeConfiguration(
        channelId,
        configuration["domain"]!,
      );
    }
  }

  @rpc({
    website: {
      kind: "closed",
      reason: "Knowledge export belongs to the owned channel fork operation.",
    },
    principals: ["host", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async exportChannelKnowledge(
    input: ExportChannelKnowledgeInput,
  ): Promise<NativeChannelKnowledge> {
    if (!this.subscriptions.ownsReasoningLoop(input.channelId))
      throw new Error("Knowledge export requires owned reasoning membership");
    const conversation = await this.nativeChannelConversation(input.channelId);
    const harness = this.admittedAgentSession();
    const binding = await retainedNativeConversationChannel(
      harness,
      conversation.id,
      BACKGROUND_CONTEXT,
    );
    const channel = this.createChannelClient(input.channelId, this.agentRpc);
    const channelRef = parseDoTargetId(await channel.resolveTarget());
    if (!channelRef || channelRef.objectKey !== input.channelId)
      throw new Error(
        "Knowledge export resolved a different canonical channel",
      );
    return exportNativeChannelKnowledge(
      {
        harness,
        conversation,
        binding,
        participantId: this.participantId(),
        channelRef,
        channel,
        configuration: () =>
          this.exportNativeAgentKnowledgeConfiguration(input.channelId),
      },
      input,
      BACKGROUND_CONTEXT,
    );
  }

  @rpc({
    website: {
      kind: "closed",
      reason: "Knowledge import belongs to the owned channel fork operation.",
    },
    principals: ["host", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async importChannelKnowledge(
    input: ImportChannelKnowledgeInput,
  ): Promise<{ ok: boolean; participantId: string }> {
    this.ensureIdentity();
    const harness = await this.agentSession(BACKGROUND_CONTEXT);
    const owner = await retainedAgentExecutionOwner(
      harness,
      BACKGROUND_CONTEXT,
    );
    if (owner.contextId !== input.contextId)
      throw new Error("Knowledge import changed its receiving host context");
    const descriptor = this.getEffectiveParticipantInfo(
      input.channelId,
      input.config,
    );
    const prepared = await this.subscriptions.prepareSubscription({
      channelId: input.channelId,
      contextId: input.contextId,
      descriptor,
      config: input.config,
      replay: false,
    });
    const intent = copyJson(prepared, { omitUndefinedProperties: true });
    await importNativeChannelKnowledge(
      harness,
      input,
      {
        initialize: async (tx, id) => {
          await this.nativeChannelBootstrap.bindImported(
            tx,
            id,
            { channelId: input.channelId, contextId: input.contextId },
            intent,
            {
              operationId: input.operationId,
              parentChannelId: input.parentChannelId,
              throughSequence: input.knowledge.throughSequence,
              knowledgeDigest: sha256HexSyncText(
                canonicalJson(input.knowledge),
              ),
            },
          );
          await this.bindNativeChannelPublication(tx, id, {
            channelId: input.channelId,
            participantId: this.rpcSelfId,
            actor: {
              kind: "agent",
              id: this.rpcSelfId,
              participantId: this.rpcSelfId,
              displayName: descriptor.name,
            },
            policy: this.getPublishPolicy(input.channelId) ?? "all",
          });
        },
      },
      BACKGROUND_CONTEXT,
    );
    await this.nativeChannelBootstrap.ready(
      harness,
      { channelId: input.channelId, contextId: input.contextId },
      BACKGROUND_CONTEXT,
    );
    return { ok: true, participantId: this.participantId() };
  }

  // ── Subagents ──────────────────────────────────────────────────────────────

  /** This agent's own subagent identity (set in `STATE_ARGS.subagent` at spawn),
   *  or null for a top-level agent. Drives retained collaboration and depth. */
  protected subagentIdentity(): SubagentIdentity | null {
    const stateArgs = this.env["STATE_ARGS"];
    const raw =
      stateArgs && typeof stateArgs === "object"
        ? (stateArgs as Record<string, unknown>)["subagent"]
        : undefined;
    if (!raw || typeof raw !== "object") return null;
    const s = raw as Record<string, unknown>;
    if (
      typeof s["runId"] !== "string" ||
      typeof s["task"] !== "string" ||
      s["task"].trim().length === 0 ||
      typeof s["parentRef"] !== "string" ||
      typeof s["parentChannelId"] !== "string" ||
      typeof s["taskChannelId"] !== "string" ||
      typeof s["parentParticipantId"] !== "string"
    ) {
      return null;
    }
    return {
      runId: s["runId"],
      task: s["task"],
      parentRef: s["parentRef"],
      parentChannelId: s["parentChannelId"],
      taskChannelId: s["taskChannelId"],
      parentContextId:
        typeof s["parentContextId"] === "string" ? s["parentContextId"] : "",
      depth: typeof s["depth"] === "number" ? s["depth"] : 0,
      mode:
        s["mode"] === "fork" || s["mode"] === "fresh" ? s["mode"] : undefined,
      parentParticipantId: s["parentParticipantId"],
      lineageParticipantIds: Array.isArray(s["lineageParticipantIds"])
        ? s["lineageParticipantIds"].filter(
            (value): value is string =>
              typeof value === "string" && value.length > 0,
          )
        : undefined,
    };
  }

  /** A wait must have a concrete wake source: live supervised work or a
   * durably admitted turn. Yielding lets the loop release its own queued work
   * without polling or borrowing the foreground turn's execution identity. */

  private currentSubagentDepth(): number {
    return this.subagentIdentity()?.depth ?? 0;
  }

  private toolText(
    text: string,
    details?: Record<string, unknown>,
  ): ToolExecutionResult {
    return {
      content: [{ type: "text", text }],
      details: copyJson(details ?? {}, { omitUndefinedProperties: true }),
    };
  }

  /**
   * Launch `spawn_subagent`. Mints the child context (deterministic under
   * `targetKey`) + child agent entity, explicitly creates the task trajectory
   * fork, wires the task channel (child subscribes, parent watches explicit messages),
   * seeds the task, records the run + the parent-trajectory task card,
   * then returns a run handle.
   * Guarded by depth/fan-out. Any failure settles inline as a tool error.
   */
  protected nativeChildLaunchOffer(channelId: string): JsonValue {
    const parent = this.subagentIdentity();
    return copyJson(
      {
        channelId,
        settings: this.getAgentSettings(),
        channelConfig: this.subscriptions.getConfig(channelId) ?? {},
        source: String(this.env["WORKER_SOURCE"] ?? ""),
        className: String(
          this.env["WORKER_CLASS_NAME"] ?? this.constructor.name,
        ),
        depth: this.currentSubagentDepth() + 1,
        maxDepth: this.getMaxSubagentDepth(),
        maxSubagents: this.getMaxSubagents(),
        lineageParticipantIds: [
          ...new Set([
            ...(parent?.lineageParticipantIds ?? []),
            ...(parent?.mode === "fork" ? [parent.parentParticipantId] : []),
            this.participantId(),
          ]),
        ],
      },
      { omitUndefinedProperties: true },
    );
  }

  private readonly nativeChildLaunch = createNativeChildLaunch({
    prepare: async (args, api, context) => {
      const execution = await this.bindNativeToolExecution(api, context);
      const binding = await retainedNativeConversationChannel(
        this.admittedAgentSession(),
        api.conversationId,
        context,
      );
      const offer = api.executionData;
      if (
        !offer ||
        typeof offer !== "object" ||
        Array.isArray(offer) ||
        offer["channelId"] !== binding.channelId ||
        !offer["settings"] ||
        typeof offer["settings"] !== "object" ||
        Array.isArray(offer["settings"]) ||
        !offer["channelConfig"] ||
        typeof offer["channelConfig"] !== "object" ||
        Array.isArray(offer["channelConfig"]) ||
        typeof offer["source"] !== "string" ||
        !offer["source"] ||
        typeof offer["className"] !== "string" ||
        !offer["className"] ||
        typeof offer["depth"] !== "number" ||
        typeof offer["maxDepth"] !== "number" ||
        typeof offer["maxSubagents"] !== "number" ||
        !Array.isArray(offer["lineageParticipantIds"])
      )
        throw new Error(
          "Native child launch lost its original offered configuration",
        );
      const p = (args ?? {}) as {
        mode?: unknown;
        task?: unknown;
        config?: unknown;
        label?: unknown;
      };
      if (p.mode !== "fresh" && p.mode !== "fork")
        throw new Error("spawn_subagent requires fresh or fork mode");
      if (typeof p.task !== "string" || !p.task.trim())
        throw new Error("spawn_subagent requires a non-empty durable task");
      if (offer["depth"] > offer["maxDepth"])
        throw new Error(
          `subagent depth limit reached (max ${offer["maxDepth"]})`,
        );
      if (
        (await this.liveSubagentExecutionCount(execution.rpc)) >=
        offer["maxSubagents"]
      )
        throw new Error(
          `subagent execution limit reached (max ${offer["maxSubagents"]})`,
        );
      const settings = offer["settings"];
      const channelConfig = offer["channelConfig"];
      const overrides = p.config === undefined ? {} : copyJson(p.config);
      if (
        !overrides ||
        typeof overrides !== "object" ||
        Array.isArray(overrides)
      )
        throw new Error("Child configuration must be an object");
      const config = {
        ...settings,
        ...Object.fromEntries(
          ["systemPrompt", "systemPromptMode"].flatMap((key) =>
            channelConfig[key] === undefined ? [] : [[key, channelConfig[key]]],
          ),
        ),
        ...overrides,
      };
      if (
        typeof config["model"] !== "string" ||
        !this.materializedModel(binding.channelId, config["model"])
      )
        throw new Error(
          "Child model cannot be materialized: " + String(config["model"]),
        );
      const fallback = config["fallbackModel"];
      if (
        fallback !== undefined &&
        (typeof fallback !== "string" ||
          !this.materializedModel(binding.channelId, fallback))
      )
        throw new Error(
          "Child fallback model cannot be materialized: " + String(fallback),
        );
      const targetKey = `subagent:${execution.invocationId}`;
      let knowledge: NativeChannelKnowledge | null = null;
      if (p.mode === "fork") {
        const snapshot = await this.createChannelClient(
          binding.channelId,
          execution.rpc,
        ).getReplayAfter({ after: 0 });
        const throughSequence = snapshot.ready.snapshotLastSeq;
        if (typeof throughSequence !== "number")
          throw new Error("Child fork has no canonical channel frontier");
        knowledge = await this.exportChannelKnowledge({
          operationId: targetKey,
          channelId: binding.channelId,
          throughSequence,
        });
      }
      return {
        kind: "vibestudio.child-launch",
        conversationId: api.conversationId,
        taskId: api.taskId,
        invocationId: execution.invocationId,
        channelId: binding.channelId,
        targetKey,
        childContextId: contextIdForTargetKey(targetKey),
        taskChannelId: `task-${execution.invocationId}`,
        prepared: copyJson(
          {
            mode: p.mode,
            task: p.task,
            label:
              typeof p.label === "string" && p.label.trim()
                ? p.label
                : p.mode === "fork"
                  ? "forked subagent"
                  : "subagent",
            config,
            source: offer["source"],
            className:
              typeof config["className"] === "string"
                ? config["className"]
                : offer["className"],
            parentContextId: binding.contextId,
            ownerEntityId: this.participantId(),
            depth: offer["depth"],
            lineageParticipantIds:
              p.mode === "fork" ? offer["lineageParticipantIds"] : [],
            requestedConfig: overrides,
            knowledge,
            startedAt: Date.now(),
          },
          { omitUndefinedProperties: true },
        ),
      };
    },
    launch: (intent, api, context) =>
      this.performNativeChildLaunch(intent, api, context),
    cleanup: async (intent, api, context) => {
      const execution = await this.bindNativeToolExecution(api, context);
      if (execution.invocationId !== intent.invocationId)
        throw new Error("Child cleanup changed its actual owner");
      if (this.subscriptions.getParticipantId(intent.taskChannelId))
        await this.unsubscribeChannel(intent.taskChannelId);
      await execution.rpc.call("main", "runtime.destroyContext", [
        { contextId: intent.childContextId, recursive: true },
      ]);
      const run = this.subagentRuns.get(intent.invocationId);
      if (run)
        await this.settleSubagentTerminal(
          run,
          "abandoned",
          "Child launch cancelled before completion",
          api,
          context,
          execution.rpc,
          "resource:" + run.runId,
        );
    },
  });

  protected executeNativeSpawn(
    ...args: Parameters<typeof this.nativeChildLaunch.execute>
  ) {
    return this.nativeChildLaunch.execute(...args);
  }
  protected cancelNativeSpawn(
    ...args: Parameters<typeof this.nativeChildLaunch.cancel>
  ) {
    return this.nativeChildLaunch.cancel(...args);
  }

  private async performNativeChildLaunch(
    intent: NativeChildLaunchIntent,
    api: ToolExecutionApi,
    context: Context,
  ): Promise<ToolExecutionResult> {
    const execution = await this.bindNativeToolExecution(api, context);
    if (execution.invocationId !== intent.invocationId)
      throw new Error("Child launch changed its original invocation");
    const p = intent.prepared;
    if (
      !p ||
      typeof p !== "object" ||
      Array.isArray(p) ||
      (p["mode"] !== "fresh" && p["mode"] !== "fork") ||
      typeof p["task"] !== "string" ||
      typeof p["label"] !== "string" ||
      typeof p["source"] !== "string" ||
      typeof p["className"] !== "string" ||
      typeof p["parentContextId"] !== "string" ||
      typeof p["ownerEntityId"] !== "string" ||
      typeof p["depth"] !== "number" ||
      typeof p["startedAt"] !== "number" ||
      !Array.isArray(p["lineageParticipantIds"]) ||
      !p["config"] ||
      typeof p["config"] !== "object" ||
      Array.isArray(p["config"])
    )
      throw new Error("Child launch lost its retained original plan");
    const config = p["config"];
    const runId = intent.invocationId;
    const existing = this.subagentRuns.get(runId);
    if (existing && existing.status !== "starting") {
      if (existing.status === "running")
        await this.publishSubagentSeed(existing, p["task"]);
      return this.toolText(
        subagentLaunchReceipt(existing),
        this.subagentRunDetails(existing),
      );
    }
    const invocationRpc = execution.rpc;
    const { contextId } = await createSubagentContext(invocationRpc, {
      parentContextId: p["parentContextId"],
      ownerEntityId: p["ownerEntityId"],
      targetKey: intent.targetKey,
    });
    if (contextId !== intent.childContextId)
      throw new Error(
        "Child provisioning changed its admitted resource identity",
      );
    const child = await createAgentEntity(invocationRpc, {
      source: p["source"],
      className: p["className"],
      key: intent.targetKey,
      contextId,
      agentChannelId: intent.taskChannelId,
      config,
      stateArgs: {
        subagent: {
          runId,
          task: p["task"],
          mode: p["mode"],
          parentRef: p["ownerEntityId"],
          parentChannelId: intent.channelId,
          taskChannelId: intent.taskChannelId,
          parentContextId: p["parentContextId"],
          depth: p["depth"],
          parentParticipantId: this.participantId(),
          lineageParticipantIds: p["lineageParticipantIds"],
        },
      },
    });
    const run: SubagentRunRow = existing ?? {
      runId,
      nativeTaskId: intent.taskId,
      taskChannelId: intent.taskChannelId,
      parentContextId: p["parentContextId"],
      childContextId: contextId,
      childEntityId: child.id ?? child.targetId,
      childParticipantId: null,
      parentChannelId: intent.channelId,
      mode: p["mode"],
      label: p["label"],
      depth: p["depth"],
      status: "starting",
      sourceEventId: null,
      semanticIntegrationSnapshot: null,
      startedAt: p["startedAt"],
      lastActivityAt: p["startedAt"],
      launchConfig: observableSubagentLaunchConfig(config),
    };
    if (
      run.nativeTaskId !== intent.taskId ||
      run.childContextId !== contextId ||
      run.childEntityId !== (child.id ?? child.targetId)
    )
      throw new Error("Child launch record changed its actual resource owner");
    this.subagentRuns.insert(run);
    const subscription =
      p["mode"] === "fork"
        ? await importAgentChannelKnowledge(invocationRpc, child, {
            operationId: intent.targetKey,
            parentChannelId: intent.channelId,
            channelId: intent.taskChannelId,
            contextId,
            knowledge: p["knowledge"] as unknown as NativeChannelKnowledge,
            config,
          })
        : await subscribeAgentToChannel(invocationRpc, child, {
            channelId: intent.taskChannelId,
            contextId,
            config,
            replay: false,
          });
    this.subagentRuns.setChildParticipantId(runId, subscription.participantId);
    const effective = await invocationRpc.call<Record<string, unknown>>(
      child.targetId,
      "getAgentSettings",
      [],
    );
    for (const key of ["model", "thinkingLevel"] as const)
      if (effective[key] !== config[key])
        throw new Error("Child launch changed original " + key);
    this.subagentRuns.setLaunchConfig(
      runId,
      observableSubagentLaunchConfig(effective),
    );
    await this.subscribeChannel({
      channelId: intent.taskChannelId,
      contextId,
      config: { wakePolicy: "explicit" },
      replay: false,
      delivery: "addressed",
    });
    await this.createChannelClient(
      intent.taskChannelId,
      invocationRpc,
    ).recordTaskProvenance({
      parentChannelId: intent.channelId,
      parentContextId: p["parentContextId"],
      runId,
    });
    const started = this.subagentRuns.get(runId);
    if (!started?.childParticipantId)
      throw new Error("Child launch has no actual participant identity");
    await this.publishSubagentStarted(started, execution.rpc);
    this.subagentRuns.setStatus(runId, "running");
    const running = this.subagentRuns.get(runId);
    if (!running)
      throw new Error("Child launch lost its retained collaborator");
    await this.publishSubagentSeed(running, p["task"]);
    return this.toolText(
      subagentLaunchReceipt(running),
      this.subagentRunDetails(running),
    );
  }

  private subagentRunDetails(run: SubagentRunRow): Record<string, unknown> {
    return {
      runId: run.runId,
      runRef: subagentRunReference(run),
      mode: run.mode,
      label: run.label,
      taskChannelId: run.taskChannelId,
      contextId: run.childContextId,
      parentContextId: run.parentContextId,
      childEntityId: run.childEntityId,
      status: run.status,
      sourceEventId: run.sourceEventId,
      semanticIntegration: semanticIntegrationForRun(run),
      ...(run.launchConfig ? { launchConfig: run.launchConfig } : {}),
    };
  }

  private async resolveSubagentRun(
    runId: string,
    parentChannelId?: string,
  ): Promise<SubagentRunRow | null> {
    const existing = this.subagentRuns.resolveReference(runId, parentChannelId);
    if (existing) {
      if (!existing.run.parentContextId)
        throw new Error("Child run lost its original parent context");
      return existing.run;
    }
    return null;
  }

  private async publishSubagentSeed(
    run: SubagentRunRow,
    task: string,
  ): Promise<void> {
    if (!task.trim()) return;
    if (!run.childParticipantId) {
      throw new Error(
        `subagent ${run.runId} has no child participant identity`,
      );
    }
    const participantId =
      this.subscriptions.getParticipantId(run.taskChannelId) ??
      this.participantId();
    const messageId = `subagent-seed:${run.runId}`;
    const senderMetadata = {
      type: "headless",
      name: "Subagent task",
      handle: "subagent-task",
      parentParticipantId: participantId,
      subagentRunId: run.runId,
    };
    await publishAgentTaskSeed(this.createChannelClient(run.taskChannelId), {
      senderParticipantId: participantId,
      task: subagentFirstTaskPrompt({ task, mode: run.mode }),
      messageId,
      childParticipantId: run.childParticipantId,
      senderMetadata,
      // A retry reuses messageId as its idempotency key, so the complete event
      // must be byte-stable too. The run timestamp is durable across retries.
      createdAt: new Date(run.startedAt).toISOString(),
    });
  }

  /** Post a message into a subagent's task channel (parent → child). */
  protected async sendToSubagent(
    toolCallId: string,
    runId: string,
    message: string,
    parentChannelId?: string,
    toolRpc: RpcClient = this.rpc,
  ): Promise<ToolExecutionResult> {
    const run = await this.resolveSubagentRun(runId, parentChannelId);
    if (!run) {
      throw this.subagentReferenceError(`unknown subagent run ${runId}`, {
        runId,
      });
    }
    if (run.status === "abandoned") {
      throw Object.assign(
        new Error(
          `subagent ${run.runId} is terminal (${run.status}) and cannot receive execution messages. ` +
            `Its retained result stays inspectable and mergeable; to continue this line of work, spawn a new run.`,
        ),
        {
          code: "SubagentTerminal",
          errorData: {
            code: "SubagentTerminal",
            runId: run.runId,
            runRef: subagentRunReference(run),
            status: run.status,
            sourceEventId: run.sourceEventId,
            allowedOperations: [
              "inspect_subagent",
              "read_subagent",
              "merge_subagent",
              "spawn_subagent",
            ],
          },
        },
      );
    }
    if (typeof message !== "string" || !message.trim()) {
      throw new Error("notify to a subagent run requires non-empty content");
    }
    const participantId =
      this.subscriptions.getParticipantId(run.taskChannelId) ??
      this.participantId();
    if (!run.childParticipantId) {
      throw this.subagentReferenceError(
        `subagent ${run.runId} is not ready to receive targeted messages`,
        { runId: run.runId },
      );
    }
    const messageId = `subagent-msg:${toolCallId}`;
    await this.createChannelClient(run.taskChannelId, toolRpc).send(
      participantId,
      messageId,
      message,
      {
        senderMetadata: { type: "agent", name: participantId },
        to: [{ kind: "participant", participantId: run.childParticipantId }],
      },
    );
    if (run.status !== "starting" && run.status !== "running") {
      this.subagentRuns.setStatus(run.runId, "running");
    }
    this.subagentRuns.touch(run.runId, Date.now());
    const handle = subagentRunReference(run);
    return this.toolText(`sent to subagent ${handle}`, {
      runId: run.runId,
      runRef: handle,
      messageId,
    });
  }

  /** Inspect semantic child state through VCS. */
  protected async inspectSubagent(
    runId: string,
    query: string,
    parentChannelId?: string,
    page: { limit: number; cursor?: string } = { limit: 20 },
  ): Promise<ToolExecutionResult> {
    const wrapperStartedAt = performance.now();
    const wrapperWallStartedAt = Date.now();
    const run = await this.resolveSubagentRun(runId, parentChannelId);
    const runResolvedAt = performance.now();
    if (!run) {
      throw this.subagentReferenceError(`unknown subagent run ${runId}`, {
        runId,
      });
    }
    const q = (query ?? "status").trim() || "status";
    if (!["status", "diff", "log"].includes(q) && !splitRepoPath(q)) {
      throw this.subagentReferenceError(
        `Unknown child inspection query ${q}; use status, diff, log, or an exact repo-prefixed file path`,
        {
          runId: run.runId,
          runRef: subagentRunReference(run),
          query: q,
          referenceKind: "child-file-path",
        },
      );
    }
    const vcs = createSubagentVcsClient(this.rpc);
    const childStatusStartedAt = performance.now();
    const childStatus = vcs.status({ contextId: run.childContextId });
    let statusFetchMs = 0;
    let semanticQueryMs = 0;
    let result: unknown;
    let renderedResult: string | null = null;
    let semanticRun = run;
    let semanticProjections: readonly VcsIntegrationProjection[] = [];
    let semanticWorkingHead: VcsStateNodeRef | undefined;
    if (q === "status") {
      const [status, parentStatus] = await Promise.all([
        childStatus,
        run.parentContextId
          ? vcs.status({ contextId: run.parentContextId })
          : null,
      ]);
      statusFetchMs = performance.now() - childStatusStartedAt;
      if (status.clean && status.committed.kind === "event") {
        this.subagentRuns.setSourceEventId(run.runId, status.committed.eventId);
        semanticRun = { ...run, sourceEventId: status.committed.eventId };
      }
      semanticProjections = parentStatus?.integrating ?? [];
      semanticWorkingHead = parentStatus?.workingHead;
      result = status;
    } else if (q === "diff") {
      if (!run.parentContextId) {
        throw new Error(
          `subagent ${run.runId} has no parent context for a relative diff`,
        );
      }
      const [status, parentStatus] = await Promise.all([
        childStatus,
        vcs.status({ contextId: run.parentContextId }),
      ]);
      statusFetchMs = performance.now() - childStatusStartedAt;
      const queryStartedAt = performance.now();
      const comparison = await vcs.compare({
        target: parentStatus.workingHead,
        source: status.workingHead,
        limit: page.limit,
        ...(page.cursor ? { cursor: page.cursor } : {}),
      });
      semanticQueryMs = performance.now() - queryStartedAt;
      if (status.clean && status.committed.kind === "event") {
        this.subagentRuns.setSourceEventId(run.runId, status.committed.eventId);
        semanticRun = { ...run, sourceEventId: status.committed.eventId };
      }
      semanticProjections = parentStatus.integrating;
      semanticWorkingHead = parentStatus.workingHead;
      result = {
        child: {
          contextId: status.contextId,
          committed: status.committed,
          workingHead: status.workingHead,
          clean: status.clean,
          workingCounts: status.workingCounts,
        },
        parent: {
          contextId: parentStatus.contextId,
          workingHead: parentStatus.workingHead,
        },
        comparison,
        note: status.clean
          ? "Comparison includes the child's committed work."
          : "Comparison includes the child's current working state, including the reported uncommitted semantic work.",
      };
      renderedResult =
        `${renderCompareReview(comparison)}\n` +
        (status.clean
          ? "Child source is committed and clean."
          : `Child has ${status.workingCounts.changes} uncommitted semantic change(s); comparison includes its current working state.`);
    } else if (q === "log") {
      const status = await childStatus;
      statusFetchMs = performance.now() - childStatusStartedAt;
      const queryStartedAt = performance.now();
      result = await vcs.history({
        root: status.committed,
        direction: "past",
        limit: page.limit,
        ...(page.cursor ? { cursor: page.cursor } : {}),
      });
      semanticQueryMs = performance.now() - queryStartedAt;
    } else {
      const status = await childStatus;
      statusFetchMs = performance.now() - childStatusStartedAt;
      const requestedPath = q.replace(/^\/+/, "");
      const queryStartedAt = performance.now();
      const file = await resolveToolFile(
        vcs,
        status.workingHead,
        requestedPath,
      );
      semanticQueryMs = performance.now() - queryStartedAt;
      if (!file) {
        throw this.subagentReferenceError(
          `no managed file at ${requestedPath} in subagent ${run.runId}; ` +
            "use an exact repo-prefixed path — inspect the child's diff or log for the paths it touched",
          {
            runId: run.runId,
            runRef: subagentRunReference(run),
            path: requestedPath,
            referenceKind: "child-file-path",
          },
        );
      }
      result = file;
    }
    const totalMs = performance.now() - wrapperStartedAt;
    if (totalMs >= 100) {
      this.traceHotPath(run.parentChannelId, "subagent-inspect.completed", {
        startedAt: wrapperWallStartedAt,
        details: {
          queryKind:
            q === "status" || q === "diff" || q === "log" ? q : "managed-file",
          runResolutionMs: Math.round(runResolvedAt - wrapperStartedAt),
          statusFetchMs: Math.round(statusFetchMs),
          semanticQueryMs: Math.round(semanticQueryMs),
          totalMs: Math.round(totalMs),
        },
      });
    }
    return this.toolText(
      renderedResult ??
        (typeof result === "string" ? result : JSON.stringify(result, null, 2)),
      {
        runId: run.runId,
        runRef: subagentRunReference(run),
        query: q,
        semanticIntegration: semanticIntegrationForRun(
          semanticRun,
          semanticProjections,
          semanticWorkingHead,
        ),
      },
    );
  }

  /** Merge a child event through the same coordinate engine used everywhere else. */
  protected async mergeSubagent(
    runId: string,
    parentChannelId?: string,
    resolutions: VcsMergeInput["resolutions"] = [],
    intentSummary?: string,
    toolRpc: RpcClient = this.rpc,
  ): Promise<ToolExecutionResult> {
    const wrapperStartedAt = performance.now();
    const wrapperWallStartedAt = Date.now();
    const run = await this.resolveSubagentRun(runId, parentChannelId);
    const runResolvedAt = performance.now();
    if (!run) {
      throw this.subagentReferenceError(`unknown subagent run ${runId}`, {
        runId,
      });
    }
    if (!run.parentContextId) {
      throw new Error(
        `subagent ${run.runId} has no recoverable parent context`,
      );
    }

    const vcs = createSubagentVcsClient(toolRpc);
    let mergeCalls = 0;
    let compareCalls = 0;
    const countedVcs = {
      ...vcs,
      merge: ((input) => {
        mergeCalls += 1;
        return vcs.merge(input);
      }) as typeof vcs.merge,
      compare: ((input) => {
        compareCalls += 1;
        return vcs.compare(input);
      }) as typeof vcs.compare,
    };
    const [targetStatus, sourceStatus] = await Promise.all([
      vcs.status({ contextId: run.parentContextId }),
      vcs.status({ contextId: run.childContextId }),
    ]);
    const sourceVerifiedAt = performance.now();
    if (!sourceStatus.clean) {
      this.subagentRuns.touch(run.runId, Date.now());
      return this.toolText(
        `subagent ${run.runId} has uncommitted semantic work; commit the child context before merging`,
        {
          protocol: SUBAGENT_MERGE_PROTOCOL,
          runId: run.runId,
          runRef: subagentRunReference(run),
          status: "source-uncommitted",
          source: sourceStatus,
        },
      );
    }
    if (sourceStatus.committed.kind !== "event") {
      throw new Error(`subagent ${run.runId} has no committed source event`);
    }

    const sourceEventId = sourceStatus.committed.eventId;
    this.subagentRuns.setSourceEventId(run.runId, sourceEventId);
    const source = { kind: "event" as const, eventId: sourceEventId };
    const driven = await driveMerge({
      vcs: countedVcs,
      contextId: run.parentContextId,
      expectedWorkingHead: targetStatus.workingHead,
      source,
      ...(resolutions ? { resolutions } : {}),
      ...(intentSummary ? { intentSummary } : {}),
      headline: `Merge subagent ${run.runId}`,
      commandIdForPage: ({ expectedWorkingHead }) =>
        subagentVcsCommandId("merge", run, {
          contextId: run.parentContextId,
          expectedWorkingHead,
          source,
          resolutions,
          intentSummary,
        }),
    });
    this.subagentRuns.setSemanticIntegrationSnapshot(run.runId, {
      state:
        driven.review.resolution.complete && driven.review.resolution.concluded
          ? "complete"
          : driven.review.counts.adopt +
                driven.review.counts.composed +
                driven.review.counts.convergent >
              0
            ? "integrating"
            : "needs-decision",
      source,
      remainingCoordinateCount:
        driven.review.resolution.remainingCoordinateCount,
      mergeableCoordinateCount:
        driven.review.counts.adopt +
        driven.review.counts.composed +
        driven.review.counts.convergent,
      conflictCoordinateCount: driven.review.counts.conflict,
      concluded: driven.review.resolution.concluded,
      asOfWorkingHead: driven.workingHead,
      stale: false,
    });
    this.subagentRuns.touch(run.runId, Date.now());
    const totalMs = performance.now() - wrapperStartedAt;
    if (totalMs >= 100) {
      console.info("[SubagentMergeProfile] merge_subagent wrapper", {
        runResolutionMs: runResolvedAt - wrapperStartedAt,
        sourceVerificationMs: sourceVerifiedAt - runResolvedAt,
        driveMergeMs: performance.now() - sourceVerifiedAt,
        totalMs,
        mergeCalls,
        compareCalls,
      });
      this.traceHotPath(run.parentChannelId, "subagent-merge.completed", {
        startedAt: wrapperWallStartedAt,
        details: {
          runResolutionMs: Math.round(runResolvedAt - wrapperStartedAt),
          sourceVerificationMs: Math.round(sourceVerifiedAt - runResolvedAt),
          driveMergeMs: Math.round(performance.now() - sourceVerifiedAt),
          totalMs: Math.round(totalMs),
          mergeCalls,
          compareCalls,
        },
      });
    }
    return this.toolText(renderMergeReview(driven.review), {
      protocol: SUBAGENT_MERGE_PROTOCOL,
      runId: run.runId,
      runRef: subagentRunReference(run),
      sourceEventId,
      ...driven,
    });
  }

  /** Read a subagent's task-channel envelopes since a cursor (the `manual`-wake
   *  read path). Returns the child's messages + the next cursor. */
  protected async readSubagent(
    runId: string,
    afterSeq: number,
    parentChannelId?: string,
    toolRpc: RpcClient = this.rpc,
  ): Promise<ToolExecutionResult> {
    const run = await this.resolveSubagentRun(runId, parentChannelId);
    if (!run) {
      throw this.subagentReferenceError(`unknown subagent run ${runId}`, {
        runId,
      });
    }
    const envelope = await this.createChannelClient(
      run.taskChannelId,
      toolRpc,
    ).getReplayAfter({
      after: Number.isFinite(afterSeq) ? afterSeq : 0,
    });
    let nextSeq = Number.isFinite(afterSeq) ? afterSeq : 0;
    const messages: Array<{ seq: number; author: string; text: string }> = [];
    for (const event of envelope.logEvents) {
      nextSeq = Math.max(nextSeq, event.id ?? 0);
      if (event.type !== AGENTIC_EVENT_PAYLOAD_KIND) continue;
      const agentic = event.payload as AgenticEvent | null;
      if ((agentic as { kind?: string } | null)?.kind !== "message.completed")
        continue;
      const text = this.extractMessageText(agentic);
      if (!text) continue;
      messages.push({
        seq: event.id ?? 0,
        author: event.senderId ?? "unknown",
        text,
      });
    }
    if (messages.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No new subagent messages after this cursor.",
          },
        ],
        details: {
          runId: run.runId,
          runRef: subagentRunReference(run),
          nextSeq,
          messages,
          empty: true,
          hasMore: envelope.ready.hasMoreAfter === true,
        },
      };
    }
    const rendered = messages
      .map((m) => `[#${m.seq} ${m.author}]\n${m.text}`)
      .join("\n\n");
    return this.toolText(rendered, {
      runId: run.runId,
      runRef: subagentRunReference(run),
      nextSeq,
      messages,
      empty: false,
      hasMore: envelope.ready.hasMoreAfter === true,
    });
  }

  /** Cancel current execution while retaining the collaborator and context. */
  protected async cancelSubagent(
    runId: string,
    reason: string,
    api: ToolExecutionApi,
    context: Context,
    parentChannelId: string,
    toolRpc: RpcClient,
    admit = true,
  ): Promise<ToolExecutionResult> {
    let intent = api.continuation;
    if (intent === undefined) {
      if (!admit) return { content: [] };
      const run = await this.resolveSubagentRun(runId, parentChannelId);
      if (!run)
        throw this.subagentReferenceError("unknown subagent run " + runId, {
          runId,
        });
      const activity =
        run.status === "abandoned"
          ? { active: false }
          : await toolRpc.call<{ active: boolean }>(
              run.childEntityId,
              "readSubagentExecutionActivity",
              [
                {
                  runId: run.runId,
                  runRef: subagentRunReference(run),
                  taskChannelId: run.taskChannelId,
                },
              ],
              { signal: context.abortSignal },
            );
      if (!activity.active)
        return this.toolText(
          "Subagent " + subagentRunReference(run) + " is already " + run.status,
          {
            ...this.subagentRunDetails(run),
            cancelled: false,
            terminal: true,
          },
        );
      const execution = await this.bindNativeToolExecution(api, context);
      intent = copyJson(
        {
          kind: "vibestudio.child-cancellation",
          conversationId: api.conversationId,
          taskId: api.taskId,
          operationId: execution.invocationId,
          run,
          reason,
        },
        { omitUndefinedProperties: true },
      );
      await api.retainContinuation(intent, () => {}, context);
    }
    if (
      !intent ||
      typeof intent !== "object" ||
      Array.isArray(intent) ||
      intent["kind"] !== "vibestudio.child-cancellation" ||
      intent["conversationId"] !== api.conversationId ||
      intent["taskId"] !== api.taskId ||
      typeof intent["operationId"] !== "string" ||
      typeof intent["reason"] !== "string" ||
      !intent["run"] ||
      typeof intent["run"] !== "object" ||
      Array.isArray(intent["run"])
    )
      throw new Error("Child cancellation lost its original native owner");
    const run = intent["run"] as unknown as SubagentRunRow;
    if (run.parentChannelId !== parentChannelId)
      throw new Error("Child cancellation changed its original parent");
    await toolRpc.call(
      run.childEntityId,
      "cancelSubagentExecution",
      [
        {
          operationId: intent["operationId"],
          runId: run.runId,
          runRef: subagentRunReference(run),
          taskChannelId: run.taskChannelId,
          reason: intent["reason"],
        },
      ],
      { signal: context.abortSignal },
    );
    await this.settleSubagentTerminal(
      run,
      "cancelled",
      intent["reason"],
      api,
      context,
      toolRpc,
      intent["operationId"],
    );
    return this.toolText("Cancelled subagent " + subagentRunReference(run), {
      ...this.subagentRunDetails(this.subagentRuns.get(run.runId) ?? run),
      cancelled: true,
      retained: true,
    });
  }

  /** Idempotent core of cancellation: interrupt the current execution, then
   *  settle its cancellation fact. The retained collaborator may later run
   *  another assignment through the same handle and context. */

  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async cancelSubagentExecution(input: {
    operationId: string;
    runId: string;
    taskChannelId: string;
    reason: string;
  }): Promise<{ cancelled: true }> {
    const subagent = this.subagentIdentity();
    if (
      !subagent ||
      subagent.runId !== input.runId ||
      subagent.taskChannelId !== input.taskChannelId ||
      subagent.parentRef !== this.rpcCallerId
    ) {
      throw new Error(
        "cancelSubagentExecution: caller does not own this subagent run",
      );
    }
    const context = {
      ...BACKGROUND_CONTEXT,
      abortSignal: this.rpcAbortSignal ?? undefined,
    };
    const conversation = await this.admittedNativeChannelConversation(
      input.taskChannelId,
    );
    if (!conversation)
      throw new Error("Child cancellation has no admitted native conversation");
    const taskId = await this.nativeConversationCancellation.admit(
      conversation,
      input.operationId,
      context,
    );
    await this.admittedAgentSession().waitForTask(taskId, context);
    await this.reconcileAgentAuthority();
    return { cancelled: true };
  }

  @rpc({
    website: {
      kind: "closed",
      reason: "Subagent activity is private orchestration state.",
    },
    principals: ["code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async readSubagentExecutionActivity(input: {
    runId: string;
    taskChannelId: string;
  }): Promise<{ active: boolean }> {
    const subagent = this.subagentIdentity();
    if (
      !subagent ||
      subagent.runId !== input.runId ||
      subagent.parentRef !== this.rpcCallerId ||
      subagent.taskChannelId !== input.taskChannelId
    ) {
      throw new Error(
        "readSubagentExecutionActivity: caller does not own this subagent run",
      );
    }
    return { active: await this.subagentExecutionActive(input.taskChannelId) };
  }

  private async liveSubagentExecutionCount(
    rpc: RpcCaller,
    parentChannelId?: string,
  ): Promise<number> {
    const runs = this.subagentRuns
      .listAll()
      .filter(
        (run) =>
          run.status !== "abandoned" &&
          (parentChannelId === undefined ||
            run.parentChannelId === parentChannelId),
      );
    const activity = await Promise.all(
      runs.map(async (run) => {
        if (run.status === "starting") return true; // Original provisioning still owns the slot.
        const state = await rpc.call<{ active: boolean }>(
          run.childEntityId,
          "readSubagentExecutionActivity",
          [{ runId: run.runId, taskChannelId: run.taskChannelId }],
        );
        return state.active;
      }),
    );
    return activity.filter(Boolean).length;
  }

  protected async subagentExecutionActive(channelId: string): Promise<boolean> {
    const conversation =
      await this.admittedNativeChannelConversation(channelId);
    if (!conversation) return false;
    const inspection =
      await this.admittedAgentSession().inspect(BACKGROUND_CONTEXT);
    return (
      inspection.tasks.some(
        ({ record }) =>
          record.conversationId === conversation.id &&
          !record.background &&
          record.state.status !== "terminal",
      ) ||
      inspection.submissions.some(
        (submission) =>
          submission.conversationId === conversation.id &&
          (submission.status === "queued" || submission.status === "placed"),
      )
    );
  }

  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async retireSubagentExecution(input: {
    runId: string;
    taskChannelId: string;
    reason: string;
  }): Promise<{ retired: true }> {
    const subagent = this.subagentIdentity();
    if (
      !subagent ||
      subagent.runId !== input.runId ||
      subagent.taskChannelId !== input.taskChannelId ||
      subagent.parentRef !== this.rpcCallerId
    ) {
      throw new Error(
        "retireSubagentExecution: caller does not own this subagent run",
      );
    }
    await this.interruptChannelAndCancelDeferredEvals(
      input.taskChannelId,
      true,
    );
    return { retired: true };
  }

  private subagentReferenceError(
    message: string,
    detail: Record<string, unknown>,
  ): Error {
    return Object.assign(new Error(message), {
      code: "InvalidReference",
      errorData: {
        code: "InvalidReference",
        operation: "subagent-reference",
        ...detail,
      },
    });
  }

  /** Publish the terminal subagent card and notify the parent, then mark the run
   *  terminal to keep delivery retryable if either terminal side effect fails.
   *  `spawn_subagent`
   *  returns when the child is launched; child completion is a later event, not
   *  the terminal for the original tool.
   */
  protected async settleSubagentTerminal(
    run: SubagentRunRow,
    outcome: "failed" | "cancelled" | "abandoned",
    text: string,
    port?: Pick<ToolExecutionApi, "commit">,
    context: Context = BACKGROUND_CONTEXT,
    rpc: RpcClient = this.rpc,
    operationId = "resource:" + run.runId,
  ): Promise<void> {
    const canonicalStatus = await this.publishSubagentTerminal(
      run,
      outcome,
      text,
      port,
      context,
      rpc,
      operationId,
    );
    this.subagentRuns.setStatus(run.runId, canonicalStatus);
  }

  private async publishSubagentStarted(
    run: SubagentRunRow,
    rpc: RpcClient,
  ): Promise<void> {
    const participantId =
      this.subscriptions.getParticipantId(run.parentChannelId) ??
      this.participantId();
    const actor: ActorRef = {
      kind: "agent",
      id: run.childEntityId,
      displayName: run.label || "Subagent",
      metadata: {
        type: "agent",
        subagentRunId: run.runId,
        taskChannelId: run.taskChannelId,
      },
    };
    const event = {
      kind: "task.started",
      actor,
      causality: {
        taskId: run.runId as never,
        invocationId: run.runId as never,
      },
      payload: {
        protocol: AGENTIC_PROTOCOL_VERSION,
        taskType: "subagent",
        title: run.label || "Subagent",
        summary: run.label,
        details: {
          subagent: {
            runId: run.runId,
            mode: run.mode,
            taskChannelId: run.taskChannelId,
            contextId: run.childContextId,
            parentContextId: run.parentContextId,
            childEntityId: run.childEntityId,
            childParticipantId: run.childParticipantId,
            label: run.label,
            launchConfig: run.launchConfig,
          },
        },
      },
      createdAt: new Date(run.startedAt).toISOString(),
    } as unknown as AgenticEvent;
    await this.createChannelClient(
      run.parentChannelId,
      rpc,
    ).publishAgenticEvent(participantId, event, {
      idempotencyKey: `subagent-started:${run.runId}`,
      senderMetadata: actor.metadata,
    });
  }

  private async publishSubagentTerminal(
    run: SubagentRunRow,
    outcome: "failed" | "cancelled" | "abandoned",
    text: string,
    port: Pick<ToolExecutionApi, "commit"> | undefined,
    context: Context,
    rpc: RpcClient,
    operationId: string,
  ): Promise<"failed" | "cancelled" | "abandoned"> {
    const participantId =
      this.subscriptions.getParticipantId(run.parentChannelId) ??
      this.participantId();
    const channel = this.createChannelClient(run.parentChannelId, rpc);
    const key = "subagent-terminal:" + run.runId + ":" + operationId;
    const canonicalStatus = (canonical: ChannelEvent | null) => {
      if (!canonical) return null;
      if (
        canonical.type !== AGENTIC_EVENT_PAYLOAD_KIND ||
        canonical.senderId !== participantId
      )
        throw new Error(
          "Supervisor terminal receipt changed its original sender",
        );
      const accepted = canonical.payload as AgenticEvent;
      const status = this.subagentTerminalStatus(accepted, run.runId);
      if (
        !status ||
        ![
          participantId,
          ...(status === "failed" ? [run.childParticipantId] : []),
        ].includes(accepted.actor.participantId ?? accepted.actor.id)
      )
        throw new Error(
          "Supervisor terminal receipt changed its original owner",
        );
      return status;
    };
    const accepted = canonicalStatus(
      (await channel.getEnvelope("ik:" + key)) as ChannelEvent | null,
    );
    if (accepted) return accepted;
    const conversation = await this.admittedNativeChannelConversation(
      run.parentChannelId,
    );
    if (!conversation || !run.parentContextId)
      throw new Error("Supervisor terminal publication lost its native parent");
    const actor: ActorRef = {
      kind: "agent",
      id: participantId,
      displayName: "Supervisor",
      metadata: {
        type: "agent",
        supervision: true,
        subagentRunId: run.runId,
        taskChannelId: run.taskChannelId,
      },
    };
    const kindByOutcome = {
      failed: "task.failed",
      cancelled: "task.cancelled",
      abandoned: "task.abandoned",
    } as const;
    const terminalOutcome = {
      failed: "tool_error",
      cancelled: "cancelled",
      abandoned: "abandoned",
    } as const;
    const sourceEventId =
      this.subagentRuns.get(run.runId)?.sourceEventId ?? run.sourceEventId;
    const event = await retainNativeSubagentTerminal(
      port ?? conversation,
      conversation.id,
      {
        operationId,
        runId: run.runId,
        parentChannelId: run.parentChannelId,
        parentContextId: run.parentContextId,
        childEntityId: run.childEntityId,
        childContextId: run.childContextId,
        taskChannelId: run.taskChannelId,
        senderId: participantId,
      },
      () =>
        ({
          kind: kindByOutcome[outcome],
          actor,
          causality: { taskId: run.runId, invocationId: run.runId },
          createdAt: new Date().toISOString(),
          payload: {
            protocol: AGENTIC_PROTOCOL_VERSION,
            reason: text,
            terminalOutcome: terminalOutcome[outcome],
            to: [{ kind: "participant", participantId }],
            details: {
              runId: run.runId,
              outcome: terminalOutcome[outcome],
              ...(sourceEventId ? { sourceEventId } : {}),
            },
          },
        }) as unknown as AgenticEvent,
      context,
    );
    await channel.publishAgenticEvent(participantId, event, {
      idempotencyKey: key,
      senderMetadata: actor.metadata,
    });
    const settled = canonicalStatus(
      (await channel.getEnvelope("ik:" + key)) as ChannelEvent | null,
    );
    if (!settled)
      throw new Error(
        "Supervisor cancellation has no canonical parent receipt",
      );
    return settled;
  }

  private authorizedSubagentTerminalStatus(
    run: SubagentRunRow,
    envelope: ChannelEvent,
    sourceChannelId: string,
  ): "failed" | "cancelled" | "abandoned" | null {
    if (envelope.type !== AGENTIC_EVENT_PAYLOAD_KIND) return null;
    const event = envelope.payload as AgenticEvent;
    const status = this.subagentTerminalStatus(event, run.runId);
    if (!status) return null;
    const actorParticipantId = event.actor.participantId ?? event.actor.id;
    // The retained child may report its own execution failure. Only the
    // supervisor may cancel or abandon it, or report an unreachable child.
    const supervisorParticipantId =
      this.subscriptions.getParticipantId(run.parentChannelId) ??
      this.participantId();
    const supervisor =
      sourceChannelId === run.parentChannelId &&
      envelope.senderId === supervisorParticipantId &&
      actorParticipantId === supervisorParticipantId;
    const childFailure =
      sourceChannelId === run.taskChannelId &&
      status === "failed" &&
      envelope.senderId === run.childParticipantId &&
      actorParticipantId === run.childParticipantId;
    return supervisor || childFailure ? status : null;
  }

  private subagentTerminalStatus(
    event: AgenticEvent,
    runId: string,
  ): "failed" | "cancelled" | "abandoned" | null {
    if (event.causality?.taskId !== runId) return null;
    switch (event.kind) {
      case "task.failed":
        return "failed";
      case "task.cancelled":
        return "cancelled";
      case "task.abandoned":
        return "abandoned";
      default:
        return null;
    }
  }

  private async mirrorSubagentTerminalToParent(
    run: SubagentRunRow,
    canonicalEnvelope: ChannelEvent,
  ): Promise<void> {
    const canonicalEvent = canonicalEnvelope.payload as AgenticEvent;
    if (
      !canonicalEnvelope.messageId ||
      !this.authorizedSubagentTerminalStatus(
        run,
        canonicalEnvelope,
        run.taskChannelId,
      )
    )
      throw new Error(
        "Subagent terminal mirror lost its original canonical child source",
      );
    if (!this.subagentTerminalStatus(canonicalEvent, run.runId)) {
      throw new Error(
        `refusing to mirror a non-canonical terminal for subagent ${run.runId}`,
      );
    }
    const participantId =
      this.subscriptions.getParticipantId(run.parentChannelId) ??
      this.participantId();
    await this.createChannelClient(run.parentChannelId).publishAgenticEvent(
      participantId,
      canonicalEvent,
      {
        idempotencyKey: `subagent-terminal:${run.runId}:source:${sha256HexSyncText(
          canonicalJson({
            channelId: run.taskChannelId,
            messageId: canonicalEnvelope.messageId,
          }),
        )}`,
      },
    );
  }

  /** Compensation for a spawn transaction that never reached a published
   * running result. This is intentionally unreachable from normal lifecycle. */

  // ── Wake discipline (explicit supervisor messages / manual) ─────────────────

  private extractMessageText(agentic: AgenticEvent | null): string {
    const blocks =
      (agentic as { payload?: { blocks?: unknown[] } } | null)?.payload
        ?.blocks ?? [];
    return blocks
      .map((block) =>
        block &&
        typeof block === "object" &&
        typeof (block as { content?: unknown }).content === "string"
          ? (block as { content: string }).content
          : "",
      )
      .filter(Boolean)
      .join("\n");
  }

  private eventAddressesSelf(
    channelId: string,
    payload: {
      mentions?: string[];
      to?: Array<{ kind?: string; participantId?: string }>;
    },
  ): boolean {
    const selfPid =
      this.subscriptions.getParticipantId(channelId) ?? this.participantId();
    if (Array.isArray(payload.mentions) && payload.mentions.includes(selfPid))
      return true;
    if (Array.isArray(payload.to)) {
      for (const target of payload.to) {
        if (target?.kind === "all") return true;
        if (target?.participantId === selfPid) return true;
      }
    }
    return false;
  }

  /**
   * Resolve whether an inbound envelope wakes the loop NOW, per the channel's
   * wakePolicy. Non-default policies consume the event here. An explicit
   * supervisor message is routed to the owning run's parent channel; ordinary
   * progress remains in the durable task-channel log and parent task card.
   */

  /** Route an intentional child-to-supervisor update to the parent without
   *  presenting it as a replacement user request. */
  private nativeExplicitChildReport(
    channelId: string,
    event: ChannelEvent,
    agentic: AgenticEvent,
  ): NativeChannelSelection | null {
    const run = this.subagentRuns.getByTaskChannel(channelId);
    if (!run || run.childParticipantId !== event.senderId) return null;
    const update = this.extractMessageText(agentic).trim();
    if (!update) return null;
    const label = `${run.label ? JSON.stringify(run.label) + " " : ""}${subagentRunReference(run)} (address run:${subagentRunReference(run)})`;
    return {
      targetChannelId: run.parentChannelId,
      intake: {
        kind: "input",
        whenBusy: "steer",
        content:
          "Subagent " +
          label +
          " sent a report for the existing user request.\n\nReport:\n" +
          update,
      },
    };
  }

  private reconcileNativeDeliveryProjection(
    delivery: ChannelDeliveryInput,
  ): void {
    const envelope = delivery.envelope as RpcChannelMessage;
    if (
      envelope.kind !== "log" ||
      !envelope.event ||
      envelope.event.type !== AGENTIC_EVENT_PAYLOAD_KIND
    )
      return;
    const event = envelope.event;
    const agentic = event.payload as AgenticEvent;
    const runId = agentic.causality?.taskId;
    const run = typeof runId === "string" ? this.subagentRuns.get(runId) : null;
    if (
      run &&
      (run.taskChannelId === delivery.channelId ||
        run.parentChannelId === delivery.channelId)
    ) {
      const status = this.authorizedSubagentTerminalStatus(
        run,
        event,
        delivery.channelId,
      );
      if (status) {
        this.subagentRuns.setStatus(run.runId, status);
        this.subagentRuns.touch(run.runId, event.ts);
      }
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  private async nativeChannelInspection(channelId: string) {
    const harness = this.existingAgentSession();
    if (!harness)
      return { loaded: false, channelId, observation: "not-loaded" } as const;
    const conversation =
      await this.admittedNativeChannelConversation(channelId);
    if (!conversation)
      return {
        loaded: true,
        channelId,
        conversationId: null,
        observation: "no-admitted-conversation",
      } as const;
    return {
      loaded: true,
      channelId,
      ...(await readNativeChannelInspection(
        harness,
        conversation.id,
        BACKGROUND_CONTEXT,
      )),
    };
  }

  private async activationDebugState(
    channelId?: string,
  ): Promise<Record<string, unknown>> {
    const channels = channelId ? [channelId] : this.nativeReasoningChannelIds();
    const conversations = Object.fromEntries(
      await Promise.all(
        channels.map(
          async (id) => [id, await this.nativeChannelInspection(id)] as const,
        ),
      ),
    );
    return {
      participantId: this.participantId(),
      conversations,
      retainedSubagentRuns: this.subagentRuns.listAll().length,
      liveSubagentRuns: this.subagentRuns.countLive(),
    };
  }

  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async getDebugState(channelId?: string): Promise<Record<string, unknown>> {
    return this.activationDebugState(channelId);
  }

  /**
   * Comprehensive self-snapshot for an agent introspecting itself from eval (the
   * `agent` binding): identity + resolved per-agent config + channel memberships
   * + active tools + this channel's turn state + an effect summary.
   */
  async describeSelf(channelId: string): Promise<Record<string, unknown>> {
    const execution = await this.nativeChannelInspection(channelId);
    const activeTools = (await this.nativeProductTools(channelId)).map(
      (tool) => tool.name,
    );
    return {
      identity: {
        id: this.participantId(),
        objectKey: this.objectKey,
        source: String(this.env["WORKER_SOURCE"] ?? ""),
        className: String(
          this.env["WORKER_CLASS_NAME"] ?? this.constructor.name,
        ),
      },
      config: this.getAgentSettings(),
      channels: this.subscriptions.listAll(),
      tools: { active: activeTools },
      execution,
    };
  }

  /**
   * Validate + apply a per-agent config patch (the `agent.configure`/setter write
   * path from eval). Every field is freely settable — including `approvalLevel`,
   * which is a UX convenience; all sensitive operations are gated by out-of-band
   * app approvals. Writes the per-agent record (applies to all the agent's channels).
   */
  private validatedSettings(patch: Record<string, unknown>): StoredSettings {
    const next: StoredSettings = {};
    if ("model" in patch) {
      if (typeof patch["model"] !== "string" || !patch["model"]) {
        throw new Error("model must be a non-empty 'provider:model' string");
      }
      next.model = patch["model"];
    }
    if ("thinkingLevel" in patch) {
      const l = patch["thinkingLevel"];
      if (!isThinkingLevel(l)) {
        throw new Error(
          "thinkingLevel must be minimal|low|medium|high|xhigh|max",
        );
      }
      next.thinkingLevel = l;
    }
    if ("fastMode" in patch) {
      if (typeof patch["fastMode"] !== "boolean") {
        throw new Error("fastMode must be a boolean");
      }
      next.fastMode = patch["fastMode"];
    }
    if ("fallbackModel" in patch) {
      if (
        typeof patch["fallbackModel"] !== "string" ||
        !patch["fallbackModel"]
      ) {
        throw new Error(
          "fallbackModel must be a non-empty 'provider:model' string",
        );
      }
      next.fallbackModel = patch["fallbackModel"];
    }
    if ("fallbackThinkingLevel" in patch) {
      const level = patch["fallbackThinkingLevel"];
      if (!isThinkingLevel(level)) {
        throw new Error(
          "fallbackThinkingLevel must be minimal|low|medium|high|xhigh|max",
        );
      }
      next.fallbackThinkingLevel = level;
    }
    if ("fallbackOn" in patch) {
      if (!isFallbackOn(patch["fallbackOn"])) {
        throw new Error(
          `fallbackOn must be a non-empty array containing only ${[
            ...CONFIGURABLE_FALLBACK_FAILURE_CODES,
          ].join("|")}`,
        );
      }
      next.fallbackOn = [...patch["fallbackOn"]];
    }
    if ("fallbackScope" in patch) {
      const scope = patch["fallbackScope"];
      if (scope !== "unattended" && scope !== "all-turns") {
        throw new Error("fallbackScope must be unattended|all-turns");
      }
      next.fallbackScope = scope;
    }
    if ("approvalLevel" in patch) {
      const l = patch["approvalLevel"];
      if (l !== 0 && l !== 1 && l !== 2)
        throw new Error("approvalLevel must be 0, 1, or 2");
      next.approvalLevel = l;
    }
    if ("respondPolicy" in patch) {
      if (!isRespondPolicy(patch["respondPolicy"]))
        throw new Error("invalid respondPolicy");
      next.respondPolicy = patch["respondPolicy"];
    }
    if ("respondFrom" in patch) {
      const from = patch["respondFrom"];
      if (!Array.isArray(from) || !from.every((x) => typeof x === "string")) {
        throw new Error(
          "respondFrom must be an array of handle/participant strings",
        );
      }
      next.respondFrom = from as string[];
    }
    return next;
  }

  async configureAgent(patch: Record<string, unknown>): Promise<AgentSettings> {
    return this.updateSettings(this.validatedSettings(patch));
  }

  private readonly nativeChannelBootstrap = createNativeChannelBootstrap({
    join: async (binding, intent) => {
      const prepared = intent as unknown as PreparedChannelSubscription;
      if (
        prepared.channelId !== binding.channelId ||
        prepared.input.contextId !== binding.contextId
      )
        throw new Error(
          "Native bootstrap changed its admitted membership context",
        );
      return (await this.subscriptions.joinPrepared(prepared)).envelope;
    },
    replayAfter: (binding, request) =>
      this.createChannelClient(binding.channelId, this.agentRpc).getReplayAfter(
        request,
      ),
    contextForEvent: (binding, event, projected) => {
      if (!projected || projected.status !== "completed" || projected.retracted)
        return [];
      const content = this.turnContent(binding.channelId, {
        ...event,
        payload: { payload: { blocks: projected.blocks ?? [] } },
      });
      return content
        ? [
            {
              role: "user",
              content: `[Channel participant ${projected.actor.id}]\n${content}`,
              timestamp: event.ts,
            },
          ]
        : [];
    },
    prepareConfiguration: async (binding, intent, context, imported) => {
      const conversation = await this.admittedNativeChannelConversation(
        binding.channelId,
      );
      if (!conversation)
        throw new Error("Native configuration has no bound conversation");
      const configuration = await retainedNativeChannelKnowledgeConfiguration(
        this.admittedAgentSession(),
        conversation.id,
        context,
      );
      await this.restoreNativeAgentKnowledgeConfiguration(
        binding.channelId,
        configuration,
      );
      const prepared = intent as unknown as PreparedChannelSubscription;
      const fork = imported
        ? {
            oldChannelId: imported.parentChannelId,
            newChannelId: binding.channelId,
            forkPointPubsubId: imported.throughSequence,
          }
        : null;
      if (fork) await this.onChannelForked(fork);
      await this.prepareNativeChannelProduct(
        binding.channelId,
        prepared.input.applicationConfig?.value,
        fork,
        context,
      );
      return this.prepareNativeChannelInitialization(binding.channelId);
    },
    afterConfiguration: (binding, _intent, context) =>
      this.activateNativeChannelProduct(binding.channelId, context),
  });

  protected override nativeProductExtensions(): readonly Extension[] {
    return [
      this.nativeModelPolicyExtension,
      defineExtension({
        name: "vibestudio.product-lifecycle",
        tasks: [
          this.nativeChannelBootstrap.task,
          this.nativeInputSettlement.task,
          this.nativeConversationCancellation.task,
          this.nativeModelReset.task,
          ...this.nativeAutomationRuns.tasks,
        ],
      }),
    ];
  }

  private readonly nativeModelPolicy = createNativeProductModelPolicy();
  private readonly nativeModelPolicyExtension = defineExtension({
    name: "vibestudio.product-model-policy",
    hooks: [this.nativeModelPolicy.generationHooks],
  });

  protected override async prepareNativeChannelConfiguration(
    tx: Tx,
    id: ConversationId,
    configuration: NativeProductChannelConfiguration,
  ): Promise<void> {
    await this.nativeModelPolicy.configure(tx, id, configuration.modelPolicy);
  }

  protected override async awaitNativeChannelReadiness(
    channelId: string,
    _conversation: Conversation,
    context: Context,
  ): Promise<Conversation> {
    const harness = this.admittedAgentSession();
    const owner = await retainedAgentExecutionOwner(harness, context);
    return this.nativeChannelBootstrap.ready(
      harness,
      { channelId, contextId: owner.contextId },
      context,
    );
  }

  protected override nativeReasoningChannelIds(): readonly string[] {
    return this.subscriptions
      .listChannelIds()
      .filter((channelId) => this.subscriptions.ownsReasoningLoop(channelId));
  }

  private nativeCoreTools(channelId: string): ToolRegistration[] {
    const author = (
      make: (execution?: AgentToolExecutionContext) => ToolRegistration,
    ) =>
      authorNativeTool(make, (api, context) =>
        this.bindNativeToolExecution(api, context),
      );
    return [
      ...(this.includeMemoryRecallTool()
        ? [author((execution) => this.createMemoryRecallTool(execution))]
        : []),
      author((execution) =>
        this.createAutomationLaunchTool(channelId, execution),
      ),
      author((execution) =>
        this.createAutomationControlTool(channelId, execution),
      ),
      author((execution) =>
        this.createAutomationCompletionTool(channelId, execution),
      ),
    ];
  }

  /** Peer methods are selected by the product's ordinary getTools contract.
   * Reduced agents therefore do not inherit an ambient client tool surface. */
  protected createAdvertisedChannelTools(
    channelId: string,
    localTools: readonly ToolRegistration[],
    capturedRoster: readonly RosterEntry[],
  ): ToolRegistration[] {
    return createNativeChannelMethodTools(
      channelId,
      this.participantId(),
      capturedRoster,
      new Set(
        [...this.nativeCoreTools(channelId), ...localTools].map(
          (tool) => tool.name,
        ),
      ),
      this.nativeMethodExecution,
    );
  }

  private async nativeProductTools(
    channelId: string,
  ): Promise<ToolRegistration[]> {
    const tools = [
      ...this.nativeCoreTools(channelId),
      ...(await this.getTools(channelId)),
    ];
    return [...new Map(tools.map((tool) => [tool.name, tool])).values()];
  }

  protected override async getNativeChannelConfiguration(
    channelId: string,
  ): Promise<NativeProductChannelConfiguration> {
    await this.refreshLocalModelEntry(channelId);
    const settings = this.getAgentSettings();
    const divider = settings.model.indexOf(":");
    const provider =
      divider < 0 ? "anthropic" : settings.model.slice(0, divider);
    const modelId =
      divider < 0 ? settings.model : settings.model.slice(divider + 1);
    const materialized = this.materializedModel(channelId, settings.model);
    if (!materialized)
      throw new Error("Agent model cannot be materialized: " + settings.model);
    const fallbackRef = settings.fallbackModel ?? LOCAL_FALLBACK_MODEL_REF;
    const fallback = this.materializedModel(channelId, fallbackRef);
    if (!fallback)
      throw new Error(
        "Agent fallback model cannot be materialized: " + fallbackRef,
      );
    const models = [materialized, fallback];
    const localModels = [
      ...new Map(
        models
          .filter((model) => model.spec.provider === LOCAL_PROVIDER_ID)
          .map((model) => [model.spec.id, model]),
      ).values(),
    ];
    if (localModels.length)
      this.installNativeModelProvider(
        createProvider({
          id: LOCAL_PROVIDER_ID,
          name: "Local models",
          auth: { apiKey: createProtectedModelAuth() },
          models: localModels.map(({ spec, toolsCapable }) => ({
            id: spec.id,
            name: spec.name,
            api: "openai-completions",
            provider: LOCAL_PROVIDER_ID,
            baseUrl: spec.baseUrl,
            reasoning: spec.reasoning,
            input: spec.input,
            cost: spec.cost,
            contextWindow: spec.contextWindow,
            maxTokens: spec.maxTokens,
            capabilities: { tools: toolsCapable },
            compat: { supportsReasoningEffort: false },
          })),
          api: openAICompletionsApi(),
        }),
      );
    for (const model of models)
      if (!this.nativeModels().getModel(model.spec.provider, model.spec.id))
        throw new Error(
          "Native provider does not contain selected model: " +
            model.spec.provider +
            ":" +
            model.spec.id,
        );
    const modelPolicy: NativeProductModelSettings = {
      primaryModel: { provider, modelId },
      fallbackModel: {
        provider: fallback.spec.provider,
        modelId: fallback.spec.id,
      },
      ...(settings.fallbackThinkingLevel
        ? { fallbackThinkingLevel: settings.fallbackThinkingLevel }
        : {}),
      ...(settings.fallbackOn ? { fallbackOn: [...settings.fallbackOn] } : {}),
      fallbackScope: settings.fallbackScope ?? "unattended",
      fastMode: settings.fastMode,
    };
    const descriptor = this.getEffectiveParticipantInfo(
      channelId,
      this.subscriptions.getConfig(channelId),
    );
    return {
      modelPolicy,
      agent: {
        model: { provider, modelId },
        thinkingLevel: settings.thinkingLevel,
        stream: nativeProductStream(provider, modelId, settings.fastMode),
        extensions: [this.nativeModelPolicyExtension],
        instructions: await this.composePrompt(channelId),
      },
      tools: await this.nativeProductTools(channelId),
      projection: {
        channelId,
        participantId: this.rpcSelfId,
        actor: {
          kind: "agent",
          id: this.rpcSelfId,
          participantId: this.rpcSelfId,
          displayName: descriptor.name,
        },
        policy: this.getPublishPolicy(channelId) ?? "all",
        ...(this.subagentIdentity()?.taskChannelId === channelId
          ? { reportTo: this.subagentIdentity()!.parentParticipantId }
          : {}),
      },
    };
  }

  protected override async releaseAgentResources(
    input: LifecyclePrepareInput,
    harness: Harness,
  ): Promise<void> {
    const reason = new Error("Agent activation released");
    const cleanup: Promise<unknown>[] = [
      this.channelMethodRelays.release(reason),
      this.directMethodCalls.release(reason),
      this.releaseNativeModelHelpers(reason),
      this.nativeAutomationRuns.drain(BACKGROUND_CONTEXT),
    ];
    if (input.mode === "retire") {
      for (const channelId of this.subscriptions.listChannelIds()) {
        if (!this.subscriptions.ownsReasoningLoop(channelId)) continue;
        cleanup.push(
          (async () => {
            const owner = await retainedAgentExecutionOwner(
              harness,
              BACKGROUND_CONTEXT,
            );
            await this.nativeChannelBootstrap.cancel(
              harness,
              { channelId, contextId: owner.contextId },
              BACKGROUND_CONTEXT,
            );
            const conversation =
              await this.admittedNativeChannelConversation(channelId);
            if (conversation)
              await conversation.abort(BACKGROUND_CONTEXT, {
                background: true,
              });
          })(),
        );
      }
    }
    this.requireResourceCleanup(await Promise.allSettled(cleanup));
    if (input.mode === "retire") await this.retireRetainedSubagents();
    // Abort handlers can create settlement/publication debt. Drain it while the
    // original channel membership still exists; unsubscribe is the final step.
    await this.nativeAutomationRuns.drain(BACKGROUND_CONTEXT);
    if (input.mode === "retire") {
      await this.drainNativeRetirement(harness);
      this.requireResourceCleanup(
        await Promise.allSettled(
          this.subscriptions
            .listChannelIds()
            .map((channelId) =>
              this.subscriptions.unsubscribeFromChannel(channelId),
            ),
        ),
      );
    }
  }

  private async drainNativeRetirement(harness: Harness): Promise<void> {
    // Cleanup handlers can admit their owned publication/acknowledgement tasks.
    // Join each concrete generation of that debt before releasing membership.
    for (;;) {
      const abortedConversations = await abortQueuedAgentConversations(
        harness,
        BACKGROUND_CONTEXT,
      );
      const tasks = (await harness.inspect(BACKGROUND_CONTEXT)).tasks
        .map(({ record }) => record)
        .filter((task) => task.state.status !== "terminal");
      if (!tasks.length && abortedConversations === 0) return;
      this.requireResourceCleanup(
        await Promise.allSettled(
          tasks.map(async (task) => {
            await harness.abortTask(task.id, BACKGROUND_CONTEXT);
            await harness.waitForTask(task.id, BACKGROUND_CONTEXT);
          }),
        ),
      );
    }
  }

  private requireResourceCleanup(
    results: PromiseSettledResult<unknown>[],
  ): void {
    const failures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (failures.length === 1) throw failures[0];
    if (failures.length)
      throw new AggregateError(failures, "Agent resource cleanup failed", {
        cause: failures[0],
      });
  }

  private readonly nativeAutomationRuns = createNativeAutomationRuns({
    harness: () => this.admittedAgentSession(),
    conversation: (channelId, context) =>
      this.nativeChannelConversation(channelId, context),
    finishRun: async (input, context) => {
      const service = await this.agentRpc.call<{
        kind: "durable-object" | "worker";
        targetId?: string;
      }>("main", "workers.resolveService", ["vibestudio.missions.v1"], {
        signal: context.abortSignal,
      });
      if (service.kind !== "durable-object" || !service.targetId)
        throw new Error(
          "The automation ledger must resolve to a Durable Object",
        );
      await this.agentRpc.call(service.targetId, "finishRun", [input], {
        signal: context.abortSignal,
      });
    },
  });

  private readonly nativeEvalExecution = createNativeEvalExecution({
    harness: () => this.admittedAgentSession(),
    acknowledgements: this.agentEvalAcknowledgements,
    scopeForConversation: async (conversationId, context) =>
      (
        await retainedNativeConversationChannel(
          this.admittedAgentSession(),
          conversationId,
          context,
        )
      ).channelId,
    bindExecution: (api, context) => this.bindNativeToolExecution(api, context),
  });

  protected executeNativeEval(
    ...args: Parameters<NativeEvalExecution["execute"]>
  ) {
    return this.nativeEvalExecution.execute(...args);
  }
  protected cancelNativeEval(
    ...args: Parameters<NativeEvalExecution["cancel"]>
  ) {
    return this.nativeEvalExecution.cancel(...args);
  }

  protected override async prepareNativeChannelInput(
    tx: Tx,
    input: Parameters<NativeChannelInputPrepare>[1],
  ): Promise<void> {
    const envelope = input.delivery.envelope as RpcChannelMessage;
    const interaction =
      envelope.kind === "log" && envelope.event
        ? this.turnMetadata(envelope.event)?.interaction
        : undefined;
    // Channel-authored UI choices are product input; execution authority and
    // unattended origin come only from the original admitted automation path.
    await recordNativeProductInput(
      tx,
      input.submissionId,
      input.binding.channelId,
      interaction ? { interaction } : undefined,
    );
  }

  @rpc({
    website: {
      kind: "closed",
      reason:
        "Native settlement inspection belongs to the owned agent session.",
    },
    principals: ["host", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async waitForNativeRun(input: {
    taskId?: number;
    channelId: string;
    inputMessageId?: string;
  }): Promise<{
    channelId: string;
    conversationId: number;
    taskId?: number;
    inputs: SettledSubmissionRecord[];
    answers: NativePublishedAnswer[];
  }> {
    const context = {
      ...BACKGROUND_CONTEXT,
      abortSignal: this.rpcAbortSignal ?? undefined,
    };
    const harness = await this.agentSession(context);
    if (input.taskId === undefined && !input.inputMessageId)
      throw new Error("Native settlement requires its exact input or task");
    let conversationId: ConversationId;
    let inputIds: readonly SubmissionId[];
    let selectedTaskId: TaskId | undefined;
    if (input.taskId !== undefined) {
      if (!Number.isSafeInteger(input.taskId) || input.taskId <= 0)
        throw new Error("Native settlement requires its actual task ID");
      const task = await harness.getTask(input.taskId as TaskId, context);
      if (!task) throw new Error("Native settlement task does not exist");
      const binding = await retainedNativeConversationChannel(
        harness,
        task.conversationId,
        context,
      );
      if (binding.channelId !== input.channelId)
        throw new Error("Native settlement task belongs to another channel");
      const product = await nativeTaskProductContext(harness, task.id, context);
      if (!product?.inputs.length)
        throw new Error("Native settlement has no original admitted input");
      conversationId = task.conversationId;
      inputIds = product.inputs;
      selectedTaskId = task.id;
    } else {
      const conversation = await this.admittedNativeChannelConversation(
        input.channelId,
      );
      if (!conversation)
        throw new Error(
          "Native settlement has no admitted channel conversation",
        );
      conversationId = conversation.id;
      inputIds = [];
    }
    if (input.inputMessageId !== undefined) {
      const channelRef = parseDoTargetId(
        await this.createChannelClient(
          input.channelId,
          this.agentRpc,
        ).resolveTarget(),
      );
      if (!channelRef || channelRef.objectKey !== input.channelId)
        throw new Error("Native settlement resolved another source channel");
      const source = await waitForNativeChannelSourceMessageAt(
        harness,
        {
          channelRef,
          participantId: this.rpcSelfId,
          messageId: input.inputMessageId,
        },
        context,
      );
      if (source.conversationId !== conversationId)
        throw new Error(
          "Native settlement input belongs to another destination conversation",
        );
      if (source.submissionType !== "input")
        throw new Error(
          "The requested channel message was admitted as context rather than a model input",
        );
      if (source.submissionId === null)
        throw new Error("Native source admission lost its actual submission");
      if (
        selectedTaskId !== undefined &&
        !inputIds.includes(source.submissionId)
      )
        throw new Error(
          "Native settlement task does not answer the requested input",
        );
      inputIds = [source.submissionId];
    }
    const inputs = await Promise.all(
      inputIds.map(async (id) => {
        const submission = await harness.submission(id, context);
        if (!submission)
          throw new Error("Native settlement lost its original submission");
        return submission.wait(context);
      }),
    );
    const answers = await Promise.all(
      inputs
        .filter(
          (
            record,
          ): record is Extract<SettledSubmissionRecord, { status: "done" }> =>
            record.status === "done",
        )
        .filter((record) => record.answer !== undefined)
        .map((record) =>
          waitForNativeAnswerPublication(
            harness,
            conversationId,
            record.answer!,
            context,
          ),
        ),
    );
    return {
      channelId: input.channelId,
      conversationId,
      ...(selectedTaskId === undefined ? {} : { taskId: selectedTaskId }),
      inputs,
      answers,
    };
  }

  protected override async prepareNativeProductCommit(
    tx: Tx,
    staged: HarnessCommit,
    _context: Context,
  ): Promise<void> {
    await prepareNativeProductContexts(tx, staged);
    await this.nativeModelPolicy.prepareCommit(tx, staged);
    await prepareNativeModelEvidence(tx, staged, _context);
    await this.nativeAutomationRuns.prepare(tx, staged);
    await this.nativeInputSettlement.prepareCommit(tx, staged);
  }

  protected override async nativeInvocationExecution(
    execution: NativeInvocationExecution,
    taskId: TaskId,
    context: Context,
  ): Promise<NativeInvocationExecution> {
    const product = await nativeTaskProductContext(
      this.admittedAgentSession(),
      taskId,
      context,
    );
    const nonce = product?.metadata?.automation?.authoritySessionNonce;
    return Object.freeze({
      ...execution,
      ...(product?.metadata ? { metadata: product.metadata } : {}),
      rpc: nonce ? withExecutionAdmission(execution.rpc, nonce) : execution.rpc,
    });
  }

  protected override async onNativeSuccessfulAnswer(
    modelRef: string,
  ): Promise<void> {
    if (this.subagentIdentity()) return;
    await createDurableObjectServiceClient(
      this.rpc,
      MODEL_SETTINGS_SERVICE_PROTOCOL,
    ).call<void>("initializeDefaultAgentModel", modelRef);
  }

  protected override observeNativeModelConnection(
    request: ModelRequestTarget,
    api: ModelRequestApi,
    connection: ModelRequestConnection,
    context: Context,
  ): Promise<ModelRequestConnection> {
    return observeNativeModelConnection(request, api, connection, context);
  }

  private readonly nativeModelReset = createNativeModelReset({
    conversation: async (channelId, _context) => {
      const conversation =
        await this.admittedNativeChannelConversation(channelId);
      if (!conversation)
        throw new Error("Provider reset has no admitted native channel");
      return conversation;
    },
  });

  private async scheduleNativeResumeAtReset(
    channelId: string,
    input: { messageId?: unknown; resetAt?: unknown },
  ) {
    if (
      typeof input.messageId !== "string" ||
      !input.messageId ||
      typeof input.resetAt !== "string"
    )
      return {
        scheduled: false,
        reason:
          "Provider reset requires the failed message and its exact reset deadline",
      };
    const envelope = (await this.createChannelClient(channelId).getEnvelope(
      nativeAnswerEnvelopeId(input.messageId),
    )) as ChannelEvent | null;
    if (
      !envelope ||
      envelope.type !== AGENTIC_EVENT_PAYLOAD_KIND ||
      envelope.senderId !==
        (this.subscriptions.getParticipantId(channelId) ?? this.participantId())
    )
      return {
        scheduled: false,
        reason: "Provider reset message is not an answer from this agent",
      };
    const event = envelope.payload as AgenticEvent;
    if (
      event.kind !== "message.completed" ||
      event.causality?.messageId !== input.messageId
    )
      return {
        scheduled: false,
        reason: "Provider reset requires its exact canonical model answer",
      };
    const metadata =
      "metadata" in event.payload ? event.payload.metadata : undefined;
    const entryId = metadata?.["nativeEntryId"];
    const conversationId = metadata?.["nativeConversationId"];
    const conversation =
      await this.admittedNativeChannelConversation(channelId);
    if (
      !conversation ||
      conversationId !== conversation.id ||
      typeof entryId !== "number" ||
      !Number.isSafeInteger(entryId) ||
      entryId <= 0
    )
      return {
        scheduled: false,
        reason:
          "Provider reset message has no original native answer coordinate",
      };
    return this.nativeModelReset.schedule(
      channelId,
      { entryId: entryId as EntryId, resetAt: input.resetAt },
      { ...BACKGROUND_CONTEXT, abortSignal: this.rpcAbortSignal ?? undefined },
    );
  }

  private readonly nativeConversationCancellation =
    createNativeConversationCancellation(() => this.admittedAgentSession());

  private readonly nativeInputSettlement = createNativeInputSettlement({
    onSettled: (channelId, submission, metadata, context) =>
      this.runDetached(() =>
        this.onNativeInputSettled(channelId, submission, metadata, context),
      ),
  });

  protected async onNativeInputSettled(
    channelId: string,
    submission: SettledSubmissionRecord,
    _metadata: AgentProductMetadata | undefined,
    context: Context,
  ): Promise<void> {
    const child = this.subagentIdentity();
    if (!child || child.taskChannelId !== channelId) return;
    // The native settlement notification owns this exact delivery through reply loss.
    await this.agentRpc.call(
      child.parentRef,
      "onSubagentInputSettled",
      [
        {
          runId: child.runId,
          taskChannelId: channelId,
          submissionId: submission.id,
        },
      ],
      { signal: context.abortSignal },
    );
  }

  @rpc({
    website: {
      kind: "closed",
      reason: "Only the retained supervisor reads child settlement.",
    },
    principals: ["code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async readSubagentInputSettlement(input: {
    runId: string;
    taskChannelId: string;
    submissionId: number;
  }): Promise<{ submission: SettledSubmissionRecord; active: boolean }> {
    const child = this.subagentIdentity();
    if (
      !child ||
      child.runId !== input.runId ||
      child.taskChannelId !== input.taskChannelId ||
      child.parentRef !== this.rpcCallerId ||
      !Number.isSafeInteger(input.submissionId) ||
      input.submissionId <= 0
    )
      throw new Error(
        "Child settlement read changed its original supervisor or input",
      );
    const context = {
      ...BACKGROUND_CONTEXT,
      abortSignal: this.rpcAbortSignal ?? undefined,
    };
    const conversation = await this.admittedNativeChannelConversation(
      input.taskChannelId,
    );
    const submission = await this.admittedAgentSession().submission(
      input.submissionId as SubmissionId,
      context,
    );
    const record = await submission?.status(context);
    if (
      !conversation ||
      !record ||
      record.conversationId !== conversation.id ||
      record.type !== "input" ||
      (record.status !== "done" && record.status !== "unanswered")
    )
      throw new Error("Child settlement has no actual terminal native input");
    return {
      submission: record as SettledSubmissionRecord,
      active: await this.subagentExecutionActive(input.taskChannelId),
    };
  }

  @rpc({
    website: {
      kind: "closed",
      reason: "Only the retained child reports its input settlement.",
    },
    principals: ["code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async onSubagentInputSettled(input: {
    runId: string;
    taskChannelId: string;
    submissionId: number;
  }): Promise<{ recorded: true }> {
    const run = this.subagentRuns.get(input.runId);
    if (
      !run ||
      run.childEntityId !== this.rpcCallerId ||
      run.taskChannelId !== input.taskChannelId
    )
      throw new Error(
        "Child settlement sender does not own this supervised run",
      );
    const source = await this.agentRpc.call<{
      submission: SettledSubmissionRecord;
      active: boolean;
    }>(run.childEntityId, "readSubagentInputSettlement", [input], {
      signal: this.rpcAbortSignal ?? undefined,
    });
    if (
      source.submission.id !== input.submissionId ||
      source.submission.type !== "input" ||
      (source.submission.status !== "done" &&
        source.submission.status !== "unanswered")
    )
      throw new Error(
        "Child settlement acknowledgement changed its actual source",
      );
    if (!source.active) {
      if (source.submission.status === "unanswered" && run.status === "running") {
        const detail = source.submission.detail;
        const message = typeof detail === "string" ? detail
          : detail && typeof detail === "object" && !Array.isArray(detail) && typeof detail["message"] === "string"
            ? detail["message"] : source.submission.reason;
        await this.settleSubagentTerminal(
          run,
          source.submission.reason === "aborted" ? "cancelled" : "failed",
          message,
          undefined,
          { ...BACKGROUND_CONTEXT, abortSignal: this.rpcAbortSignal ?? undefined },
          this.rpc,
          `native-input:${source.submission.id}`,
        );
      } else {
        this.subagentRuns.markExecutionIdle(run.runId);
      }
    }
    return { recorded: true };
  }

  protected override async notifyNativeModelCredentialMissing(
    request: ModelRequestTarget,
    _api: ModelRequestApi,
    context: Context,
  ): Promise<void> {
    const binding = await retainedNativeConversationChannel(
      this.admittedAgentSession(),
      request.conversationId,
      context,
    );
    await this.publishCredentialConnectCard(
      binding.channelId,
      request.model.provider,
      {
        resumeAfterConnect: true,
        modelRef: `${request.model.provider}:${request.model.id}`,
      },
    );
  }

  private readonly nativeSuspendExecution = createNativeSuspendExecution({
    bindExecution: (api, context) => this.bindNativeToolExecution(api, context),
    channelForConversation: async (conversationId, context) =>
      (
        await retainedNativeConversationChannel(
          this.admittedAgentSession(),
          conversationId,
          context,
        )
      ).channelId,
    background: async (channelId, api, context) => {
      const execution = await this.bindNativeToolExecution(api, context);
      const live = await this.liveSubagentExecutionCount(
        execution.rpc,
        channelId,
      );
      const runs = this.subagentRuns
        .listAll()
        .filter((run) => run.parentChannelId === channelId);
      return {
        live: live > 0,
        unintegrated: runs
          .filter(
            (run) =>
              run.status === "completed" && !run.semanticIntegrationSnapshot,
          )
          .map((run) => run.runId),
      };
    },
  });

  protected executeNativeSuspend(
    ...args: Parameters<typeof this.nativeSuspendExecution.execute>
  ) {
    return this.nativeSuspendExecution.execute(...args);
  }
  protected cancelNativeSuspend(
    ...args: Parameters<typeof this.nativeSuspendExecution.cancel>
  ) {
    return this.nativeSuspendExecution.cancel(...args);
  }

  private readonly nativeMethodExecution = createNativeChannelMethodExecution({
    harness: () => this.admittedAgentSession(),
    bindExecution: (api, context) => this.bindNativeToolExecution(api, context),
    channelClient: (channelId, execution) =>
      this.createChannelClient(channelId, execution.rpc),
  });

  protected executeNativeAskUser(
    args: Record<string, JsonValue>,
    api: ToolExecutionApi,
    context: Context,
    channelId: string,
    capturedRoster: readonly RosterEntry[],
  ) {
    return this.nativeMethodExecution.execute(
      async () => {
        const humans = capturedRoster.filter(
          (entry) => entry.ref.kind === "user",
        );
        const hint = typeof args["to"] === "string" ? args["to"].trim() : "";
        const refs = humans.map((entry) => ({
          ...entry.ref,
          participantId: entry.ref.participantId ?? entry.participantId,
          ...(entry.handle
            ? { metadata: { ...entry.ref.metadata, handle: entry.handle } }
            : {}),
        }));
        const selected = hint
          ? resolveHandle(hint.replace(/^@/, ""), refs, { kinds: ["user"] })
          : null;
        if (selected && isHandleResolutionFailure(selected))
          throw new Error(
            `ask_user target is ${selected.error}: ${hint}; suggestions: ${selected.suggestions.join(", ")}`,
          );
        const targets = selected
          ? [
              humans[
                humans.findIndex(
                  (human) =>
                    human.ref.id === selected.id &&
                    human.ref.kind === selected.kind,
                )
              ]!,
            ]
          : humans;
        if (!targets.length)
          throw new Error("ask_user requires a captured human recipient");
        const question = args["question"];
        if (typeof question !== "string" || !question.trim())
          throw new Error("ask_user requires a nonempty question");
        const options = Array.isArray(args["options"])
          ? args["options"].filter(
              (option): option is string => typeof option === "string",
            )
          : [];
        const multiSelect = args["multiSelect"] === true;
        const form = options.length
          ? {
              title: question,
              fields: [
                {
                  key: "answer",
                  type: multiSelect ? "multiSelect" : "select",
                  label: question,
                  required: true,
                  options: options.map((option) => ({
                    value: option,
                    label: option,
                  })),
                  ...(args["allowFreeform"] === false
                    ? { allowFreeText: false }
                    : {}),
                  ...(multiSelect
                    ? {}
                    : { submitOnSelect: args["allowFreeform"] !== true }),
                },
              ],
              hideSubmit: multiSelect ? false : args["allowFreeform"] !== true,
            }
          : {
              title: question,
              fields: [
                {
                  key: "answer",
                  type: "string",
                  label: question,
                  required: true,
                },
              ],
            };
        return {
          channelId,
          callerId: this.participantId(),
          targetIds: targets.map((entry) => entry.participantId),
          method: "feedback_form",
          args: copyJson(form, { omitUndefinedProperties: true }),
        };
      },
      api,
      context,
    );
  }

  protected cancelNativeAskUser(
    _args: Record<string, JsonValue>,
    api: ToolExecutionApi,
    context: Context,
  ) {
    return this.nativeMethodExecution.cancel(api, context);
  }
}

function automationDefinitionSnapshot(
  automation: MissionRecord,
): AutomationDefinitionSnapshot {
  const execution = automation.charter.execution;
  const trigger = automation.charter.trigger;
  return {
    missionId: automation.missionId,
    name: automation.name,
    summary: automation.charter.summary,
    revision: automation.revision,
    action: execution.kind === "method" ? "method" : execution.action.kind,
    createdAt: automation.createdAt,
    state: "active",
    ...(automation.nextRunAt === undefined
      ? {}
      : { nextRunAt: automation.nextRunAt }),
    schedule:
      trigger.kind === "schedule"
        ? {
            kind: "interval",
            everyMs: trigger.everyMs,
            ...(trigger.anchorAt === undefined
              ? {}
              : { anchorAt: trigger.anchorAt }),
            ...(trigger.jitterMs === undefined
              ? {}
              : { jitterMs: trigger.jitterMs }),
            ...(trigger.untilAt === undefined
              ? {}
              : { untilAt: trigger.untilAt }),
            ...(trigger.maxRuns === undefined
              ? {}
              : { maxRuns: trigger.maxRuns }),
          }
        : trigger.kind === "cron"
          ? {
              kind: "cron",
              expression: trigger.expression,
              timezone: trigger.timezone,
              ...(trigger.untilAt === undefined
                ? {}
                : { untilAt: trigger.untilAt }),
              ...(trigger.maxRuns === undefined
                ? {}
                : { maxRuns: trigger.maxRuns }),
            }
          : null,
  };
}
