import type { AttachmentInput, Participant } from "@workspace/pubsub";
import type { MessageTier } from "@workspace/agentic-protocol";
import type { DefaultAgentConfig, ModelCatalog } from "@workspace/model-catalog/catalog";
import type { AgentSubscriptionConfig } from "../../agent-subscription-config.js";
import type { PendingAgent } from "../../derived-types.js";
import type { AvailableAgent, ChatParticipantMetadata } from "../../types.js";
import type { AgentConfigDraft } from "./agent-config-draft.js";
import type { UserFacingError } from "../store.js";

/** Where one held message stands in the delivery queue. */
export type PendingDeliveryStatus =
  /** Held until the first agent joins. */
  | "queued"
  /** Being published right now; it can no longer be removed. */
  | "delivering"
  /** Its delivery failed; `failure` says why. Retry or discard it. */
  | "failed"
  /** Held behind an earlier failed message (`waitingOn`), to keep order. */
  | "waiting";

/**
 * How far the first agent has come. Each stage is a lifecycle fact, not a
 * guess: model discovery/choice, the host's create call in flight, the created
 * agent not yet in the roster, and the agent present.
 */
export type LaunchStage =
  | "preparing-model"
  | "creating-agent"
  | "joining"
  | "ready"
  | "failed";

/** Why "Start agent" could not start the queued message's agent. */
export interface FirstAgentSetupRequired extends UserFacingError {
  reason: "model-needs-setup" | "no-model-selected";
  /** The selected model that needs setup, when one is selected. */
  modelRef?: string;
}

/** A message the user "sent" while no agent was present yet — held client-side
 *  (unsent) and flushed live once the first agent joins the roster, so the very
 *  first message lands as a normal live turn rather than backlog replay. */
export interface PendingDelivery {
  kind: "message" | "opening-request";
  id: string;
  text: string;
  attachments?: AttachmentInput[];
  mentions?: string[];
  replyTo?: string;
  metadata?: Record<string, unknown>;
  tier?: MessageTier;
  /** Stable key for idempotent (re)delivery — for a queued message. */
  idempotencyKey?: string;
  /** Delivery status (always set on published queue items). */
  status?: PendingDeliveryStatus;
  /** Why this item failed (status `failed`). */
  failure?: UserFacingError;
  /** The failed item this one waits behind (status `waiting`). */
  waitingOn?: string;
}

/** State for the first-agent flow: the inline armed config plus the queue of
 *  messages waiting for that agent to come online. Present only on surfaces that
 *  can create agents, or have a retained opening request. */
export interface DeferredAgentState {
  /** No agent present and one can or will be created — hides the header
   *  "Add agent" launcher (the inline setup owns adding the first agent). */
  active: boolean;
  /** Show the inline config card: no agent present, none already spawning, and
   *  we have the means to spawn one. Flips false once the first message arms it. */
  setupActive: boolean;
  /** True once the first message has armed the spawn (agent launching) — drives
   *  the "Launching agent…" spinner/explanation in the pre-send queue. */
  launching: boolean;
  /** The spawn failed (onAddAgent rejected) — drives the queue's error + retry UI. */
  launchFailed: boolean;
  /** Stage of the first agent's launch; undefined when no launch is involved. */
  launchStage?: LaunchStage;
  /** Why the launch failed (stage `failed`): what happened, next step, detail. */
  launchError?: UserFacingError;
  /** "Start agent" was blocked: the model needs setup or none is selected. */
  setupRequired?: FirstAgentSetupRequired;
  /** The first failed item's original error text (compatibility; prefer `queued[i].failure`). */
  deliveryError?: string;
  /** The currently owned publication cannot be removed as an unsent message. */
  deliveringId?: string;
  /** Retry one failed item (or every failed item when `id` is omitted). Later
   *  items resume in order once it is delivered. */
  retryDelivery: (id?: string) => void;
  /** Remove a held or failed item without sending it (an opening request is
   *  cancelled on the channel). Not possible while it is being delivered. */
  discardQueued: (id: string) => void;
  /** The host found no configured model for the first agent. Its queued first
   *  message must wait for an explicit model/provider choice. */
  modelSelectionRequired: boolean;
  /** Model/provider discovery has not resolved yet. The queued message is
   * waiting on preflight, not on an agent that has already been launched. */
  modelDiscoveryPending: boolean;
  /** Confirm the current draft and start the agent for the queued message. */
  startQueued: () => void;
  /** Retry a failed launch (re-issues the spawn). */
  retryLaunch: () => void;
  /** Inline config draft (model/effort/autonomy/…) applied to the agent spawned
   *  on the first message. */
  draft: AgentConfigDraft;
  setDraft: (next: AgentConfigDraft) => void;
  /** Selected agent-type id (worker source) for the first agent. */
  agentId: string | undefined;
  setAgentId: (id: string | undefined) => void;
  /** Agent types available to choose from (mirrors `availableAgents`). */
  availableAgents: AvailableAgent[];
  /** Messages queued (unsent) until the agent joins; rendered in the pre-send queue. */
  queued: PendingDelivery[];
  /** Drop a queued message before it is delivered. */
  cancelQueued: (id: string) => void;
}

/** Options a composer send carries (mentions, reply, payload metadata). */
export interface DeferredSendOptions {
  mentions?: string[];
  replyTo?: string;
  /** Written into the published message payload (e.g. deliverAfterTurn). */
  metadata?: Record<string, unknown>;
}

/** The composer send the machine wraps (and falls through to). */
export type DeferredComposerSend = (
  attachments?: AttachmentInput[],
  options?: DeferredSendOptions
) => Promise<void>;

/** Options for publishing a queued message (ChatSession.publishText). */
export interface DeferredPublishOptions {
  attachments?: AttachmentInput[];
  mentions?: string[];
  replyTo?: string;
  metadata?: Record<string, unknown>;
  tier?: MessageTier;
  idempotencyKey?: string;
}

/**
 * Everything the deferred-agent machine reads. Session-derived facts
 * (participants, pendingAgents, firstAgentPending, openingRequest,
 * replaySettled, channelName, input) and host capabilities (agent creation,
 * catalog, defaults, preflight) arrive through the same `setHostInputs`.
 */
export interface DeferredAgentInputs {
  participants: Record<string, Participant<ChatParticipantMetadata>>;
  pendingAgents: Map<string, PendingAgent>;
  /** Current composer text (read at send time to capture the queued message). */
  input: string;
  /** Clear the composer (text + pending attachments) after queuing a message. */
  clearComposer: () => void;
  /** Publish queued text to the channel with optimistic backfill. */
  publishText: (text: string, opts?: DeferredPublishOptions) => Promise<void>;
  /** Title the chat from the first message on the deferred-flush path. */
  maybeSetDefaultTitle: (text: string) => void;
  /** Normal send path, used once an agent is present (or when deferral is off). */
  coreSendMessage: DeferredComposerSend;
  onAddAgent?: (agentId?: string, config?: AgentSubscriptionConfig) => void | Promise<unknown>;
  /** Latest uncommitted first-agent intent. `null` asks the host to retire an
   *  existing provisional agent because this draft is not launchable. */
  onPrepareAgent?: (
    agentId: string | undefined,
    config: AgentSubscriptionConfig | null
  ) => Promise<void>;
  availableAgents: AvailableAgent[];
  modelCatalog: ModelCatalog | null;
  defaultModelRef?: string | null;
  /** Saved workspace default agent config — seeds the inline config draft. */
  defaultAgentConfig?: DefaultAgentConfig | null;
  /** Host-owned model readiness for the first agent (default `"ready"`). */
  firstAgentModelPreflight?: "checking" | "ready" | "selection-required";
  firstAgentPending: boolean;
  openingRequest?: string;
  resolveOpeningRequest: (outcome: "deliver" | "cancel") => Promise<void>;
  channelName: string;
  /** True once the initial channel snapshot and replay have settled. */
  replaySettled: boolean;
}

export interface DeferredAgentSnapshot {
  /** `undefined` when the first-agent flow is inactive and nothing is queued. */
  deferredAgent: DeferredAgentState | undefined;
}
