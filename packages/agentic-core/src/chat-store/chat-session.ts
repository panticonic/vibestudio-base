/**
 * ChatSession — one chat participant on one channel, without a UI framework.
 *
 * Owns:
 *   - the connection (`ConnectionManager`) in either delivery mode: `stream`
 *     (a response-owned event stream; browsers, CLIs) or `resident` (finite
 *     callbacks into a Durable Object). Both feed the same `ChannelViewFeed`
 *     through the manager's event callback, so the transcript, deltas and
 *     paging behave identically;
 *   - the owned connect loop and its single re-entry point `reconnect(reason)`;
 *   - roster, departures (disconnect rows), pending-agent badges, agent debug
 *     events and dirty-repo warnings;
 *   - the composer draft and the outbox: send, publish, edit, retract with an
 *     undo window, deliver-after-turn tagging, flush and interrupt;
 *   - the channel title (default title from the first user message);
 *   - the method-provider registry advertised on join.
 *
 * Every input runs one pipeline step — reduce, derive (`messages`, `agentBusy`,
 * after-turn pruning), react — and subscribers are notified once per step.
 * Browser-only behaviour (document title, attached-panel title mirroring)
 * reaches the host through `ChatSessionPorts`.
 */

import type {
  AgentDebugPayload,
  AttachmentInput,
  ChannelConfig,
  ConversationInitialization,
  IncomingEvent,
  Participant,
  PubSubClient,
  RosterUpdate,
} from "@workspace/pubsub";
import { isAgentParticipantType } from "@workspace/pubsub";
import type { MessageBlockInput, MessageTier } from "@workspace/agentic-protocol";
import { ConnectionManager, type ClientParticipantMetadata } from "../connection.js";
import type { ChatParticipantMetadata, ConnectionConfig } from "../types.js";
import type {
  ActionBarPayload,
  ChatMessage,
  DirtyRepoDetails,
  DisconnectedAgentInfo,
  MessageTypeDefinition,
  PendingAgent,
} from "../derived-types.js";
import type { InvocationCardPayload } from "../invocation-card-payload.js";
import type { ChannelViewState } from "@workspace/agentic-protocol";
import { ChannelViewFeed } from "./channel-view-feed.js";
import { DeferredAgentMachine } from "./deferred-agent/deferred-agent-machine.js";
import type { DeferredAgentInputs } from "./deferred-agent/types.js";
import { ForkLineageStore } from "./lineage/fork-lineage-store.js";
import type { ForkNavHandlers } from "./lineage/types.js";
import type { AgentSubscriptionConfig } from "../agent-subscription-config.js";
import type { AgenticChatActions, AvailableAgent } from "../types.js";
import { ChatMethodRegistry, type ChatMethodProvider } from "./methods.js";
import { connectionRetryDelayMs, isTransientConnectionFailure } from "./connection-retry.js";
import { RetainCount, StateCell, type ReadableStore } from "./store.js";

/** Maximum agent debug events retained (ring buffer). */
export const MAX_DEBUG_EVENTS = 500;
/** How long a retract/cancel stays undoable (product behaviour). */
export const UNDO_WINDOW_MS = 5_000;
/** How long a flush narration stays visible (product behaviour). */
export const FLUSH_NARRATION_MS = 4_000;

const DEFAULT_CHAT_TITLE_MAX_LENGTH = 64;

export type ChatParticipants = Record<string, Participant<ChatParticipantMetadata>>;

/** What pressing Enter does right now. */
export type PrimaryActionIntent = "send" | "steer" | "queue";

/** Transient outcome of the last incremental flush, for a pill / live region. */
export interface FlushNarration {
  text: string;
  /** Remaining queued items after this flush step. */
  remaining: number;
}

/** A short, reversible client-side undo window after retract/cancel. */
export interface UndoableAction {
  kind: "retract" | "cancel";
  /** Messages covered by this undo; consecutive cancels accumulate. */
  messageIds: string[];
  /** The resend can restore text only; the original carried richer delivery data. */
  textOnlyRestore?: boolean;
  /** Epoch ms when the undo window closes. */
  expiresAt: number;
}

export interface ConnectionErrorInfo {
  message: string;
  at: number;
  cause?: unknown;
}

export interface SendOptions {
  mentions?: string[];
  replyTo?: string;
  /** Written into the published message payload (e.g. `deliverAfterTurn`). */
  metadata?: Record<string, unknown>;
}

export interface PublishTextOptions extends SendOptions {
  attachments?: AttachmentInput[];
  tier?: MessageTier;
  idempotencyKey?: string;
}

/**
 * Why a connection should be (re)established. One entry point replaces the
 * former scattered triggers (retry button, host approval signal, option
 * changes, transient-failure loop):
 *   - `user-retry`: the user asked; always start a fresh connection.
 *   - `host-unblocked`: something that blocked joining may have resolved (a
 *     workspace review, model settings recovering); retry only when the
 *     session has no live connection.
 *   - `options-changed`: join options (creation config) changed; same rule.
 */
export type ChatReconnectReason = "user-retry" | "host-unblocked" | "options-changed";

/** Host capabilities a session may use; all optional. */
export interface ChatSessionPorts {
  /**
   * The channel title became current. `explicit` marks a title a person or
   * agent chose (as opposed to the default derived from the first message).
   * A browser panel sets `document.title` and mirrors explicit titles to its
   * frame; a terminal shows it in its tab.
   */
  presentTitle?(title: string, options: { explicit: boolean }): void;
  /**
   * Observe every channel event after the session has reduced it. For hosts
   * that record facts the view model deliberately does not project (a test
   * harness recording `ui.feedback`, an audit log).
   */
  observeEvent?(event: IncomingEvent): void;
}

export interface ChatSessionOptions {
  /** RPC + identity. `config.deliveryMode` selects `stream` (default) or `resident`. */
  config: ConnectionConfig;
  /** Channel this session joins. Required by `start()`; a host that joins
   *  through `connect()` may name the channel there instead. */
  channelName?: string;
  /** Creation config passed on join (seed, initial title, …). */
  channelConfig?: ChannelConfig;
  contextId?: string;
  /** Participant label; the channel derives authoritative human identity itself. */
  metadata?: ClientParticipantMetadata;
  ports?: ChatSessionPorts;
  /** Host agent management (first-agent setup, add/replace/remove). Can be
   *  replaced later with `setAgentHost`. */
  agentHost?: ChatAgentHost;
  /** Fork navigation. When present the session owns a `ForkLineageStore`
   *  (`session.forks`); requires `channelName`. */
  forkNav?: ForkNavHandlers;
}

/**
 * The agent-management members of `AgenticChatActions` a session drives.
 * Members are optional: a host that cannot create agents omits them and the
 * first-agent flow falls back to plain sends.
 */
export type ChatAgentHost = Pick<
  AgenticChatActions,
  | "onAddAgent"
  | "onPrepareAgent"
  | "onReplaceAgent"
  | "onPersistAgentModel"
  | "onRemoveAgent"
  | "availableAgents"
  | "modelCatalog"
  | "defaultModelRef"
  | "defaultAgentConfig"
  | "firstAgentModelPreflight"
>;

export interface ChatSessionSnapshot {
  /** The joined (or configured) channel. */
  channelName: string | null;
  /** Human-readable connection status ("Connecting...", "Connected", …). */
  status: string;
  connected: boolean;
  connectionError: ConnectionErrorInfo | null;
  /** The live channel client, once joined. */
  client: PubSubClient<ChatParticipantMetadata> | null;
  /** This participant's channel id, once joined. */
  selfId: string | null;
  initialization: ConversationInitialization | undefined;
  channelTitle: string | null;

  participants: ChatParticipants;
  /** Current plus departed participants (for attribution of old messages). */
  allParticipants: ChatParticipants;

  /** Transcript window plus local system rows (agent disconnects). */
  messages: ChatMessage[];
  view: ChannelViewState;
  hasMoreHistory: boolean;
  loadingMore: boolean;
  replaySettled: boolean;
  actionBar: ActionBarPayload | null;
  messageTypes: MessageTypeDefinition[];
  hasOpenTurn: boolean;

  debugEvents: Array<AgentDebugPayload & { ts: number }>;
  dirtyRepoWarnings: Map<string, DirtyRepoDetails>;
  pendingAgents: Map<string, PendingAgent>;

  /** Composer draft. */
  input: string;
  replyTo: string | null;

  /** Locally in-flight sends ("Sending…" ghost). */
  pendingSendCount: number;
  /** Message ids sent with after-turn intent (outbox lane cue). */
  afterTurnMessageIds: Set<string>;
  flushNarration: FlushNarration | undefined;
  undoableAction: UndoableAction | undefined;

  /** Any agent is mid-turn (typing row, roster typing flag, or open turn). */
  agentBusy: boolean;
  primaryActionIntent: PrimaryActionIntent;
}

export function titleFromFirstUserMessage(message: string): string | null {
  const normalized = message.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  if (normalized.length <= DEFAULT_CHAT_TITLE_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, DEFAULT_CHAT_TITLE_MAX_LENGTH - 3).trimEnd()}...`;
}

/**
 * Reconcile the after-turn id set against the transcript: drop an id once its
 * message is PRESENT but no longer a pending-unread self message. Ids not yet
 * in the transcript (a just-sent message whose echo has not landed) are kept.
 * Returns `prev` unchanged when nothing drops.
 */
export function pruneAfterTurnIds(
  prev: Set<string>,
  messages: ChatMessage[],
  selfId: string | null
): Set<string> {
  if (prev.size === 0) return prev;
  const byId = new Map(messages.map((m) => [m.id, m]));
  let next: Set<string> | null = null;
  for (const id of prev) {
    const message = byId.get(id);
    if (message && !isPendingSelfMessage(message, selfId)) (next ??= new Set(prev)).delete(id);
  }
  return next ?? prev;
}

function isPendingSelfMessage(message: ChatMessage, selfId: string | null): boolean {
  return (
    message.senderId === selfId &&
    (message.kind ?? "message") === "message" &&
    !message.error &&
    !message.retracted &&
    (message.receipts?.aggregate ?? "pending") === "pending"
  );
}

function computeAgentBusy(
  messages: ChatMessage[],
  participants: ChatParticipants,
  hasOpenTurn: boolean
): boolean {
  return (
    messages.some((message) => message.contentType === "typing") ||
    Object.values(participants).some(
      (participant) => (participant.metadata as { typing?: boolean })?.typing === true
    ) ||
    hasOpenTurn
  );
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });
}

type ConnectOptions = Parameters<ConnectionManager["connect"]>[0];

export class ChatSession implements ReadableStore<ChatSessionSnapshot> {
  readonly options: Readonly<ChatSessionOptions>;
  readonly metadata: ClientParticipantMetadata;
  readonly feed: ChannelViewFeed;
  readonly methods = new ChatMethodRegistry();
  /** First-agent setup and the pre-send delivery queue. */
  readonly deferredAgent: DeferredAgentMachine;
  /** Fork lineage, when the host supplied fork navigation. */
  readonly forks: ForkLineageStore | null;

  readonly #cell: StateCell<ChatSessionSnapshot>;
  readonly #retain: RetainCount;
  readonly #connection: ConnectionManager;
  readonly #ports: ChatSessionPorts;
  #channelConfig: ChannelConfig | undefined;

  // Reduction state that is not itself rendered.
  #channelMessages: ChatMessage[] = [];
  #disconnectMessages: ChatMessage[] = [];
  #derivedDisconnectMessages: ChatMessage[] = [];
  /** Every participant seen since the last transport recovery (attribution). */
  #seenParticipants: ChatParticipants = {};
  #suppressDisconnect = true;
  #expectedStops = new Set<string>();
  #defaultTitleSet: boolean;
  #hasTranscriptMessages = false;
  #retractedText = new Map<string, string>();
  #clientListeners: Array<() => void> = [];
  /** Channel id of a join whose transcript has not replaced the previous one yet. */
  #pendingFeedReset: string | null = null;

  // Owned async work.
  #loop: AbortController | null = null;
  #undoTimer: ReturnType<typeof setTimeout> | null = null;
  #flushTimer: ReturnType<typeof setTimeout> | null = null;
  #disposed = false;
  #agentHost: ChatAgentHost;
  #forkNav: ForkNavHandlers | undefined;
  /** Advances each time the host reports something unblocked (fork read cursors retry). */
  #hostUnblocked = 0;
  #composerClearedListeners = new Set<() => void>();
  #releaseSubStores: Array<() => void> = [];

  constructor(options: ChatSessionOptions) {
    this.options = options;
    this.metadata = options.metadata ?? { name: options.channelName ?? "Channel", type: "panel" };
    this.#ports = options.ports ?? {};
    this.#channelConfig = options.channelConfig;
    this.#defaultTitleSet = Boolean(options.channelConfig?.title);
    this.feed = new ChannelViewFeed({ channelId: options.channelName });
    const feedSnapshot = this.feed.getSnapshot();
    this.#cell = new StateCell<ChatSessionSnapshot>({
      channelName: options.channelName ?? null,
      status: "Connecting...",
      connected: false,
      connectionError: null,
      client: null,
      selfId: null,
      initialization: undefined,
      channelTitle: options.channelConfig?.title ?? null,
      participants: {},
      allParticipants: {},
      messages: feedSnapshot.messages,
      view: feedSnapshot.view,
      hasMoreHistory: feedSnapshot.hasMoreHistory,
      loadingMore: feedSnapshot.loadingMore,
      replaySettled: feedSnapshot.replaySettled,
      actionBar: feedSnapshot.actionBar,
      messageTypes: feedSnapshot.messageTypes,
      hasOpenTurn: feedSnapshot.hasOpenTurn,
      debugEvents: [],
      dirtyRepoWarnings: new Map(),
      pendingAgents: new Map(),
      input: "",
      replyTo: null,
      pendingSendCount: 0,
      afterTurnMessageIds: new Set(),
      flushNarration: undefined,
      undoableAction: undefined,
      agentBusy: false,
      primaryActionIntent: "send",
    });
    this.#connection = new ConnectionManager({
      config: options.config,
      metadata: this.metadata,
      callbacks: {
        onStatusChange: (status) =>
          this.#cell.update({
            status,
            connected: status === "connected",
            ...(status === "connected" ? { connectionError: null } : {}),
          }),
        onError: (error) => {
          // The connect loop owns a transient failure's outcome; logging it as
          // a defect would report a self-healing transition twice.
          if (isTransientConnectionFailure(error))
            console.debug("[ChatSession] transient connection failure:", error);
          else console.error("[ChatSession] connection error:", error);
          this.#setConnectionError(error.message, error);
        },
        onEvent: (event) => this.ingest(event),
        onRoster: (update) => this.#applyRoster(update),
        onReconnect: () =>
          this.#cell.transaction(() => {
            this.#suppressDisconnect = true;
            this.#seenParticipants = {};
            this.#disconnectMessages = [];
            this.#cell.update({ status: "Connected" });
            this.#derive();
          }),
      },
    });
    this.#agentHost = options.agentHost ?? {};
    this.#forkNav = options.forkNav;
    this.deferredAgent = new DeferredAgentMachine(this.#deferredAgentInputs());
    this.forks =
      options.forkNav && options.channelName
        ? new ForkLineageStore({
            rpc: options.config.rpc,
            channelId: options.channelName,
            ...(options.contextId ? { contextId: options.contextId } : {}),
          })
        : null;
    // Reaction step: sub-stores follow every session snapshot. Registered
    // first, so they settle before any external subscriber renders.
    this.#cell.subscribe(() => this.#reconcileSubStores());
    this.feed.subscribe(() => this.#cell.transaction(() => this.#derive()));
    this.#retain = new RetainCount({
      start: () => {
        this.#releaseSubStores = [
          this.deferredAgent.retain(),
          ...(this.forks ? [this.forks.retain()] : []),
        ];
        this.#reconcileSubStores();
      },
      dispose: () => this.#dispose(),
    });
  }

  readonly getSnapshot = (): ChatSessionSnapshot => this.#cell.getSnapshot();
  readonly subscribe = (listener: () => void): (() => void) => this.#cell.subscribe(listener);

  /** The live channel client (also in the snapshot). */
  get client(): PubSubClient<ChatParticipantMetadata> | null {
    return this.#cell.getSnapshot().client;
  }

  /**
   * Hold the session's live resources. The last release disposes it at the
   * end of the current turn (a same-turn re-retain — StrictMode — keeps it).
   */
  retain(): () => void {
    return this.#retain.retain();
  }

  /** Dispose now, regardless of holders. */
  dispose(): void {
    this.#retain.disposeNow();
  }

  /** Advertise a method group on the next join. */
  registerMethods(key: string, provider: ChatMethodProvider): () => void {
    return this.methods.register(key, provider);
  }

  // ===========================================================================
  // Connection
  // ===========================================================================

  /**
   * Begin the owned connect loop (idempotent). Transient failures retry with a
   * bounded backoff; terminal failures stop and stay visible in
   * `connectionError` until `reconnect("user-retry")`.
   */
  start(): void {
    if (this.#disposed || this.#loop || this.client) return;
    if (!this.options.channelName) throw new Error("ChatSession.start() needs options.channelName");
    const loop = new AbortController();
    this.#loop = loop;
    void this.#runConnectLoop(loop);
  }

  /** The single re-entry point for (re)establishing the connection. */
  reconnect(reason: ChatReconnectReason): void {
    if (this.#disposed) return;
    if (reason === "host-unblocked") {
      this.#hostUnblocked += 1;
      this.#reconcileSubStores();
    }
    if (reason !== "user-retry" && this.client) return;
    if (reason === "user-retry") this.dismissConnectionError();
    this.#loop?.abort(new Error(`Reconnecting: ${reason}`));
    this.#loop = null;
    if (reason === "user-retry" && this.client) {
      // A user retry replaces a live connection too; the next join disconnects
      // it first (ConnectionManager supersedes the previous generation).
      this.#detachClient();
    }
    this.start();
  }

  /** Replace the creation config used by the next join. */
  setChannelConfig(channelConfig: ChannelConfig | undefined): void {
    if (channelConfig === this.#channelConfig) return;
    this.#channelConfig = channelConfig;
    this.reconnect("options-changed");
  }

  async #runConnectLoop(loop: AbortController): Promise<void> {
    let transientAttempt = 0;
    for (;;) {
      try {
        await this.connect({
          signal: loop.signal,
          channelId: this.options.channelName!,
          methods: this.methods.compose(),
          ...(this.#channelConfig ? { channelConfig: this.#channelConfig } : {}),
          ...(this.options.contextId ? { contextId: this.options.contextId } : {}),
        });
        if (this.#loop === loop) this.#loop = null;
        return;
      } catch (error) {
        if (loop.signal.aborted) return;
        if (!isTransientConnectionFailure(error)) {
          console.error("[ChatSession] Connection error:", error);
          if (this.#loop === loop) this.#loop = null;
          return;
        }
        const delayMs = connectionRetryDelayMs(transientAttempt++);
        console.debug(`[ChatSession] Transient connection failure; retrying in ${delayMs}ms`, error);
        await abortableDelay(delayMs, loop.signal);
        if (loop.signal.aborted) return;
      }
    }
  }

  /**
   * Join the channel once with explicit options (no retry). The owned loop
   * (`start`) uses this; hosts that manage their own lifecycle (headless
   * sessions, tests) call it directly.
   */
  async connect(options: ConnectOptions): Promise<PubSubClient<ChatParticipantMetadata>> {
    this.#cell.update({ status: "Connecting..." });
    this.#detachClient();
    const pending = this.#connection.connect(options);
    // The manager retired the previous generation synchronously, so every
    // event from here on belongs to the new subscription. The previous
    // transcript stays visible until the new one delivers (its first event, or
    // its ready marker for an empty channel).
    this.#pendingFeedReset = options.channelId;
    this.#cell.update({ channelName: options.channelId });
    const client = await pending;
    options.signal?.throwIfAborted();
    this.#attachClient(client);
    return client;
  }

  /** Leave the channel (the session stays usable for a later connect). */
  async disconnect(): Promise<void> {
    this.#loop?.abort(new Error("Chat session disconnected"));
    this.#loop = null;
    this.#detachClient();
    await this.#connection.disconnect();
  }

  #attachClient(client: PubSubClient<ChatParticipantMetadata>): void {
    this.#cell.transaction(() => {
      const selfId = client.clientId ?? this.options.config.clientId;
      this.#cell.update({ client, connected: true, status: "Connected", selfId });
      this.#resetFeedForNewGeneration();
      this.feed.attach(client);
      const applyChannelConfig = (config: ChannelConfig) => this.#applyChannelConfig(config);
      if (client.channelConfig) applyChannelConfig(client.channelConfig);
      this.#clientListeners.push(
        client.onConfigChange(applyChannelConfig),
        client.onReady(() => {
          if (client.channelConfig) applyChannelConfig(client.channelConfig);
        })
      );
      // The initial roster snapshot settles badges for agents already present.
      const initialRoster = client.roster ?? {};
      this.#seenParticipants = { ...this.#seenParticipants, ...initialRoster };
      this.#cell.update((current) => ({
        pendingAgents: withoutJoinedPendingAgents(current.pendingAgents, initialRoster),
      }));
      this.#derive();
    });
  }

  #detachClient(): void {
    for (const off of this.#clientListeners.splice(0)) off();
    if (this.client) this.#cell.update({ client: null });
  }

  #applyChannelConfig(config: ChannelConfig): void {
    this.#cell.transaction(() => {
      this.#cell.update({ initialization: config.initialization });
      if (config.title) {
        this.#defaultTitleSet = true;
        this.#cell.update({ channelTitle: config.title });
        const explicit = config.titleExplicit === true && Boolean(config.title.trim());
        this.#ports.presentTitle?.(config.title, { explicit });
      }
    });
  }

  // ===========================================================================
  // Event reduction
  // ===========================================================================

  #resetFeedForNewGeneration(): void {
    if (this.#pendingFeedReset === null) return;
    this.feed.reset(this.#pendingFeedReset);
    this.#pendingFeedReset = null;
  }

  /**
   * Reduce one channel client event. The connection calls this for every
   * delivered event (stream or resident); a host with its own delivery route
   * may call it too.
   */
  ingest(event: IncomingEvent): void {
    this.#resetFeedForNewGeneration();
    if (event.type === "agent-debug") {
      this.#cell.transaction(() => this.#applyDebugEvent(event));
    } else {
      this.feed.ingest(event);
    }
    this.#ports.observeEvent?.(event);
  }

  #applyDebugEvent(event: IncomingEvent): void {
    const payload = (event as { payload: AgentDebugPayload }).payload;
    const ts = (event as { ts?: number }).ts ?? Date.now();
    this.#cell.update((current) => {
      const debugEvents = [...current.debugEvents, { ...payload, ts }];
      return {
        debugEvents:
          debugEvents.length > MAX_DEBUG_EVENTS ? debugEvents.slice(-MAX_DEBUG_EVENTS) : debugEvents,
      };
    });
    if (
      payload.debugType === "lifecycle" &&
      payload.event === "warning" &&
      payload.reason === "dirty-repo"
    ) {
      const details = payload.details as DirtyRepoDetails | undefined;
      if (details) {
        this.#cell.update((current) => {
          const next = new Map(current.dirtyRepoWarnings);
          next.set(payload.handle, details);
          return { dirtyRepoWarnings: next };
        });
      }
    }
    // An expected idle stop must not render as a disconnect.
    if (payload.debugType === "lifecycle" && payload.event === "stopped" && payload.reason === "idle") {
      this.#expectedStops.add(payload.handle);
    }
    if (payload.debugType === "spawn-error") {
      this.#cell.update((current) => {
        const existing = current.pendingAgents.get(payload.handle);
        if (!existing) return {};
        const next = new Map(current.pendingAgents);
        next.set(payload.handle, {
          ...existing,
          status: "error",
          error: {
            message: payload.error ?? "Agent failed to start",
            details: payload.buildError ? JSON.stringify(payload.buildError) : undefined,
          },
        });
        return { pendingAgents: next };
      });
    }
  }

  #applyRoster(update: RosterUpdate<ChatParticipantMetadata>): void {
    this.#cell.transaction(() => {
      const previous = this.#cell.getSnapshot().participants;
      const next = { ...update.participants };
      this.#cell.update({ participants: next });
      // A joined agent is an authoritative initialization lifecycle event.
      if (Object.values(next).some((participant) => participant.metadata?.type === "agent")) {
        this.#cell.update((current) => ({
          initialization: current.initialization
            ? { ...current.initialization, firstAgentPending: false }
            : current.initialization,
        }));
      }
      // Departure detection starts once we see ourselves in the roster (the
      // initial handshake would otherwise report spurious departures).
      if (this.#suppressDisconnect && this.options.config.clientId in next) {
        this.#suppressDisconnect = false;
      }
      this.#seenParticipants = { ...this.#seenParticipants, ...next };
      for (const [id, participant] of Object.entries(previous)) {
        if (!(id in next)) this.#seenParticipants[id] = participant;
      }
      if (!this.#suppressDisconnect) this.#recordDepartures(update, previous, next);

      // An agent with the same handle rejoining clears its departure row.
      const agentHandles = new Set(
        Object.values(next)
          .filter((participant) => isAgentParticipantType(participant.metadata.type))
          .map((participant) => participant.metadata.handle)
      );
      const remaining = this.#disconnectMessages.filter(
        (message) => !message.disconnectedAgent || !agentHandles.has(message.disconnectedAgent.handle)
      );
      if (remaining.length !== this.#disconnectMessages.length) this.#disconnectMessages = remaining;
      // A pending badge clears once its handle is in the roster.
      this.#cell.update((current) => ({
        pendingAgents: withoutJoinedPendingAgents(current.pendingAgents, next),
      }));
      this.#derive();
    });
  }

  #recordDepartures(
    update: RosterUpdate<ChatParticipantMetadata>,
    previous: ChatParticipants,
    next: ChatParticipants
  ): void {
    const leaveReason = (update as { change?: { type?: string; leaveReason?: string } }).change;
    const changeIsExpectedLeave =
      leaveReason?.type === "leave" &&
      (leaveReason.leaveReason === "graceful" || leaveReason.leaveReason === "replaced");
    for (const [participantId, participant] of Object.entries(previous)) {
      if (next[participantId]) continue;
      if (!isAgentParticipantType(participant?.metadata?.type)) continue;
      const handle = participant.metadata.handle ?? participantId;
      const expected = this.#expectedStops.has(handle) || changeIsExpectedLeave;
      this.#expectedStops.delete(handle);
      if (expected) continue;
      if (this.#disconnectMessages.some((message) => message.disconnectedAgent?.handle === handle))
        continue;
      const info: DisconnectedAgentInfo = {
        name: participant.metadata.name,
        handle,
        type: participant.metadata.type,
      };
      this.#disconnectMessages = [
        ...this.#disconnectMessages,
        {
          id: `system-disconnect-${participantId}-${Date.now()}`,
          senderId: "system",
          content: "",
          kind: "system",
          complete: true,
          disconnectedAgent: info,
          senderMetadata: { name: info.name, type: info.type, handle: info.handle },
        },
      ];
    }
  }

  /** Derive the rendered projections from reduced state. */
  #derive(): void {
    const feed = this.feed.getSnapshot();
    const current = this.#cell.getSnapshot();
    const channelMessagesChanged = feed.messages !== this.#channelMessages;
    const disconnectsChanged = this.#disconnectMessages !== this.#derivedDisconnectMessages;
    this.#channelMessages = feed.messages;
    this.#derivedDisconnectMessages = this.#disconnectMessages;
    const messages =
      channelMessagesChanged || disconnectsChanged
        ? this.#disconnectMessages.length > 0
          ? [...feed.messages, ...this.#disconnectMessages]
          : feed.messages
        : current.messages;
    if (messages.length > 0) this.#hasTranscriptMessages = true;
    const participants = current.participants;
    const allParticipants =
      Object.keys(this.#seenParticipants).length === 0
        ? participants
        : mergeParticipants(current.allParticipants, this.#seenParticipants, participants);
    const agentBusy = computeAgentBusy(messages, participants, feed.hasOpenTurn);
    this.#cell.update({
      messages,
      view: feed.view,
      hasMoreHistory: feed.hasMoreHistory,
      loadingMore: feed.loadingMore,
      replaySettled: feed.replaySettled,
      actionBar: feed.actionBar,
      messageTypes: feed.messageTypes,
      hasOpenTurn: feed.hasOpenTurn,
      allParticipants,
      afterTurnMessageIds: pruneAfterTurnIds(current.afterTurnMessageIds, messages, current.selfId),
      agentBusy,
      primaryActionIntent: agentBusy ? "steer" : "send",
    });
  }

  #setConnectionError(message: string, cause: unknown): void {
    this.#cell.update({ connectionError: { message, at: Date.now(), cause } });
  }

  dismissConnectionError(): void {
    this.#cell.update({ connectionError: null });
  }

  // ===========================================================================
  // Sub-stores: first-agent flow and fork lineage
  // ===========================================================================

  /** Replace the host's agent management (actions and catalog data). */
  setAgentHost(host: ChatAgentHost): void {
    this.#agentHost = host;
    this.#reconcileSubStores();
  }

  /** Replace the fork navigation handlers (the store itself needs `forkNav` at construction). */
  setForkNav(nav: ForkNavHandlers): void {
    this.#forkNav = nav;
    this.#reconcileSubStores();
  }

  #reconcileSubStores(): void {
    if (this.#disposed) return;
    this.deferredAgent.setHostInputs(this.#deferredAgentInputs());
    this.deferredAgent.reconcile();
    if (this.forks) {
      const snapshot = this.#cell.getSnapshot();
      this.forks.setInputs({
        client: snapshot.client,
        selfId: snapshot.selfId,
        replaySettled: snapshot.replaySettled,
        retrySignal: this.#hostUnblocked,
        ...(this.#forkNav ? { nav: this.#forkNav } : {}),
      });
    }
  }

  #deferredAgentInputs(): DeferredAgentInputs {
    const snapshot = this.#cell.getSnapshot();
    const host = this.#agentHost;
    return {
      participants: snapshot.participants,
      pendingAgents: snapshot.pendingAgents,
      input: snapshot.input,
      clearComposer: this.clearComposer,
      publishText: this.publishText,
      maybeSetDefaultTitle: this.maybeSetDefaultTitle,
      coreSendMessage: this.sendMessage,
      onAddAgent: host.onAddAgent ? this.addAgent : undefined,
      onPrepareAgent: host.onPrepareAgent ? this.prepareAgent : undefined,
      availableAgents: host.availableAgents ?? NO_AGENTS,
      modelCatalog: host.modelCatalog ?? null,
      defaultModelRef: host.defaultModelRef,
      defaultAgentConfig: host.defaultAgentConfig,
      firstAgentModelPreflight: host.firstAgentModelPreflight,
      firstAgentPending: snapshot.initialization?.firstAgentPending ?? false,
      openingRequest: snapshot.initialization?.openingRequest,
      resolveOpeningRequest: this.resolveOpeningRequest,
      channelName: snapshot.channelName ?? "",
      replaySettled: snapshot.replaySettled,
    };
  }

  /**
   * Submit the composer: the first-agent flow holds the message while the
   * first agent is coming, otherwise this is `sendMessage`.
   */
  readonly submit = (attachments?: AttachmentInput[], options?: SendOptions): Promise<void> =>
    this.deferredAgent.send(attachments, options);

  /** Release or cancel the channel's retained opening request. */
  readonly resolveOpeningRequest = async (outcome: "deliver" | "cancel"): Promise<void> => {
    const client = this.client;
    if (!client) throw new Error("Conversation is not connected");
    await client.resolveOpeningRequest(outcome);
  };

  // --- Agent management through the host (bound to this channel) ------------

  /** Whether the host can create agents. */
  get canManageAgents(): boolean {
    return Boolean(this.#agentHost.onAddAgent);
  }

  readonly addAgent = async (agentId?: string, config?: AgentSubscriptionConfig): Promise<void> => {
    const host = this.#agentHost;
    if (!host.onAddAgent) return;
    await host.onAddAgent(this.#requireChannelName(), this.client?.contextId, agentId, config);
  };

  readonly prepareAgent = async (
    agentId: string | undefined,
    config: AgentSubscriptionConfig | null
  ): Promise<void> => {
    const host = this.#agentHost;
    if (!host.onPrepareAgent) return;
    await host.onPrepareAgent(this.#requireChannelName(), this.client?.contextId, agentId, config);
  };

  readonly replaceAgent = async (
    participantId: string,
    agentId?: string,
    config?: AgentSubscriptionConfig
  ): Promise<void> => {
    const host = this.#agentHost;
    if (!host.onReplaceAgent) return;
    await host.onReplaceAgent(this.#requireChannelName(), participantId, agentId, config);
  };

  readonly persistAgentModel = async (participantId: string, model: string): Promise<void> => {
    const host = this.#agentHost;
    if (!host.onPersistAgentModel) return;
    await host.onPersistAgentModel(this.#requireChannelName(), participantId, model);
  };

  readonly removeAgent = async (handle: string): Promise<void> => {
    const host = this.#agentHost;
    if (!host.onRemoveAgent) return;
    await host.onRemoveAgent(this.#requireChannelName(), handle);
  };

  #requireChannelName(): string {
    const channelName = this.#cell.getSnapshot().channelName;
    if (!channelName) throw new Error("The conversation has no channel yet");
    return channelName;
  }

  // ===========================================================================
  // Composer
  // ===========================================================================

  setInput(value: string): void {
    this.#cell.update({ input: value });
  }

  /** Clear the draft and tell attachment owners (e.g. a browser image tray). */
  readonly clearComposer = (): void => {
    this.#cell.update({ input: "" });
    for (const listener of [...this.#composerClearedListeners]) listener();
  };

  /** Observe composer clears (attachments live with their UI owner). */
  onComposerCleared(listener: () => void): () => void {
    this.#composerClearedListeners.add(listener);
    return () => {
      this.#composerClearedListeners.delete(listener);
    };
  }

  setReplyTo(messageId: string | null): void {
    this.#cell.update({ replyTo: messageId });
  }

  // ===========================================================================
  // Outbox
  // ===========================================================================

  /**
   * Send the composer draft. The draft is cleared optimistically; a rejected
   * submission restores it (beside any newer draft) and rethrows. An accepted
   * send is never retried: a failure to read it back is reported separately.
   */
  readonly sendMessage = async (attachments?: AttachmentInput[], options?: SendOptions): Promise<void> => {
    const snapshot = this.#cell.getSnapshot();
    const client = snapshot.client;
    const text = snapshot.input.trim();
    const hasAttachments = Boolean(attachments && attachments.length > 0);
    if ((!text && !hasAttachments) || !client) return;
    const previousReplyTo = options?.replyTo ?? null;
    const isAfterTurn = options?.metadata?.["deliverAfterTurn"] === true;
    const hadPriorTranscriptMessages = this.#hasTranscriptMessages;
    this.#cell.update((current) => ({
      input: "",
      replyTo: null,
      pendingSendCount: current.pendingSendCount + 1,
    }));
    let settled = false;
    const settleGhost = () => {
      if (settled) return;
      settled = true;
      this.#cell.update((current) => ({ pendingSendCount: Math.max(0, current.pendingSendCount - 1) }));
    };
    let receipt: { messageId: string; pubsubId: number | undefined };
    try {
      receipt = await client.send(text || "", {
        attachments: hasAttachments ? attachments : undefined,
        mentions: options?.mentions && options.mentions.length > 0 ? options.mentions : undefined,
        replyTo: options?.replyTo,
        metadata: options?.metadata,
      });
    } catch (error) {
      // Never clobber a newer draft typed while this request was in flight.
      this.#cell.transaction(() => {
        settleGhost();
        const currentDraft = this.#cell.getSnapshot().input;
        this.#cell.update({
          input: currentDraft.trim() ? `${currentDraft}\n\n${text}` : text,
          ...(currentDraft.trim() ? {} : { replyTo: previousReplyTo }),
        });
      });
      console.error("[Chat] Send failed:", error);
      throw error;
    }
    this.#cell.transaction(() => {
      if (receipt.messageId && isAfterTurn) {
        this.#cell.update((current) => {
          const next = new Set(current.afterTurnMessageIds);
          next.add(receipt.messageId);
          return { afterTurnMessageIds: next };
        });
      }
      settleGhost();
    });
    await this.#backfill(receipt.pubsubId);
    if (!this.#defaultTitleSet && !hadPriorTranscriptMessages) this.#applyDefaultTitle(text);
  };

  /**
   * Publish text without touching the composer (deferred first-message
   * delivery, sandboxed UI). Rejects when not connected.
   */
  readonly publishText = async (text: string, options?: PublishTextOptions): Promise<void> => {
    const client = this.client;
    if (!client) throw new Error("Agentic chat is not connected");
    const hasAttachments = Boolean(options?.attachments?.length);
    if (!text.trim() && !hasAttachments) return;
    const { pubsubId } = await client.send(text, {
      attachments: hasAttachments ? options?.attachments : undefined,
      mentions: options?.mentions && options.mentions.length > 0 ? options.mentions : undefined,
      replyTo: options?.replyTo,
      metadata: options?.metadata,
      ...(options?.tier ? { tier: options.tier } : {}),
      ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
    });
    await this.#backfill(pubsubId);
  };

  /**
   * Title the channel from the first user message, once. Callers gate on "no
   * prior history" (the deferred first-message path bypasses `sendMessage`).
   */
  readonly maybeSetDefaultTitle = (text: string): void => {
    if (this.#defaultTitleSet) return;
    this.#applyDefaultTitle(text);
  };

  #applyDefaultTitle(text: string): void {
    const title = titleFromFirstUserMessage(text);
    if (!title) return;
    this.#defaultTitleSet = true;
    this.#cell.update({ channelTitle: title });
    this.#ports.presentTitle?.(title, { explicit: false });
    void this.client
      ?.updateChannelConfig({ title, titleExplicit: false })
      .catch((error: unknown) => {
        console.warn("[ChatSession] Failed to persist default channel title:", error);
      });
  }

  /**
   * The publication receipt is the mutation outcome. Reading it back is
   * subsequent projection work: its failure is shown without turning an
   * accepted change into a failed send.
   */
  async #backfill(pubsubId: number | undefined): Promise<void> {
    try {
      await this.feed.backfillAfterLocalPublish(pubsubId);
    } catch (cause) {
      this.#setConnectionError(
        "The server accepted the change, but the transcript could not be refreshed.",
        cause
      );
    }
  }

  /** Load earlier transcript history. */
  loadEarlierMessages(): Promise<void> {
    return this.feed.loadEarlierMessages();
  }

  /** Edit a still-unread outbox message, keeping its attachment blocks. */
  async editPendingMessage(messageId: string, newText: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    const message = this.#cell.getSnapshot().messages.find((item) => item.id === messageId);
    const blocks: MessageBlockInput[] = [
      { blockId: `${messageId}:block:0` as never, type: "text", content: newText },
      ...(message?.attachments ?? []).map((attachment, index) => ({
        blockId: `${messageId}:block:${index + 1}` as never,
        type: "attachment" as const,
        metadata: { mimeType: attachment.mimeType, filename: attachment.name },
      })),
    ];
    try {
      const { pubsubId } = await client.editMessage(messageId, blocks, { revision: message?.revision });
      await this.#backfill(pubsubId);
    } catch (error) {
      console.warn("[Chat] Edit message failed:", error);
      throw error;
    }
  }

  /**
   * Retract a still-unread outbox message and open an undo window. Cancels
   * within the window accumulate into one undoable action.
   */
  async cancelPendingMessage(messageId: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    const snapshot = this.#cell.getSnapshot();
    const message = snapshot.messages.find((item) => item.id === messageId);
    if (message) this.#retractedText.set(messageId, message.content);
    const textOnlyRestore =
      (message?.attachments?.length ?? 0) > 0 ||
      (message?.mentions?.length ?? 0) > 0 ||
      snapshot.afterTurnMessageIds.has(messageId);
    try {
      const { pubsubId } = await client.retractMessage(messageId, { reason: "Canceled by author" });
      await this.#backfill(pubsubId);
    } catch (error) {
      console.warn("[Chat] Retract message failed:", error);
      throw error;
    }
    if (this.#disposed) return;
    if (this.#undoTimer) clearTimeout(this.#undoTimer);
    const expiresAt = Date.now() + UNDO_WINDOW_MS;
    this.#cell.update((current) => ({
      undoableAction:
        current.undoableAction && current.undoableAction.kind === "cancel"
          ? {
              kind: "cancel",
              messageIds: [...current.undoableAction.messageIds, messageId],
              expiresAt,
              textOnlyRestore: current.undoableAction.textOnlyRestore || textOnlyRestore,
            }
          : { kind: "cancel", messageIds: [messageId], expiresAt, textOnlyRestore },
    }));
    this.#undoTimer = setTimeout(() => {
      this.#undoTimer = null;
      const action = this.#cell.getSnapshot().undoableAction;
      if (action) for (const id of action.messageIds) this.#retractedText.delete(id);
      this.#cell.update({ undoableAction: undefined });
    }, UNDO_WINDOW_MS);
  }

  /** Undo the last retract/cancel by re-sending every retained text. */
  undoLastAction(): void {
    const action = this.#cell.getSnapshot().undoableAction;
    if (!action) return;
    if (this.#undoTimer) clearTimeout(this.#undoTimer);
    this.#undoTimer = null;
    this.#cell.update({ undoableAction: undefined });
    for (const id of action.messageIds) {
      const text = this.#retractedText.get(id);
      this.#retractedText.delete(id);
      const client = this.client;
      if (text && client) {
        void client
          .send(text, {})
          .then(({ pubsubId }) => this.#backfill(pubsubId))
          .catch((error: unknown) => console.warn("[Chat] Undo re-send failed:", error));
      }
    }
  }

  /** Esc / "Send now": pause busy agents with flushDeferred and narrate it. */
  async flushOutboxAndInterrupt(): Promise<void> {
    const snapshot = this.#cell.getSnapshot();
    const outboxCount = snapshot.messages.filter((message) =>
      isPendingSelfMessage(message, snapshot.selfId)
    ).length;
    let paused: number;
    try {
      paused = await this.#pauseAgents(true);
    } catch {
      return; // The original RPC failure is already visible in connectionError.
    }
    // The loop decides steers-vs-deferred; one flush advances it by one step.
    const remaining = Math.max(0, outboxCount - 1);
    const text =
      paused === 0 && outboxCount === 0
        ? "Nothing to flush"
        : remaining > 0
          ? `Delivering the next message · ${remaining} still queued`
          : outboxCount > 0
            ? "Delivering your queued message…"
            : "Interrupted";
    if (this.#disposed) return;
    if (this.#flushTimer) clearTimeout(this.#flushTimer);
    this.#cell.update({ flushNarration: { text, remaining } });
    this.#flushTimer = setTimeout(() => {
      this.#flushTimer = null;
      this.#cell.update({ flushNarration: undefined });
    }, FLUSH_NARRATION_MS);
  }

  async #pauseAgents(flushDeferred: boolean): Promise<number> {
    const client = this.client;
    if (!client) return 0;
    const agentIds = Object.entries(this.#cell.getSnapshot().participants)
      .filter(([, participant]) => isAgentParticipantType(participant.metadata.type))
      .map(([id]) => id);
    let paused = 0;
    const outcomes = await Promise.allSettled(
      agentIds.map(async (id) => {
        try {
          await client.callMethod(id, "pause", {
            reason: flushDeferred ? "User requested send now" : "User interrupted execution",
            ...(flushDeferred ? { flushDeferred: true } : {}),
          }).result;
          paused += 1;
        } catch (error) {
          console.warn("[Chat] Pause agent failed:", error);
          this.#setConnectionError(
            error instanceof Error
              ? `Couldn't interrupt the agent: ${error.message}`
              : "Couldn't interrupt the agent. Try again.",
            error
          );
          throw error;
        }
      })
    );
    for (const outcome of outcomes) if (outcome.status === "rejected") throw outcome.reason;
    return paused;
  }

  /** Interrupt one agent (by participant id, or by handle). */
  async interruptAgent(agentId: string, _messageId?: string, agentHandle?: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    const roster = this.#cell.getSnapshot().allParticipants;
    const lookupHandle = !roster[agentId] ? (agentHandle ?? agentId) : null;
    let targetId = agentId;
    if (lookupHandle) {
      const match = Object.entries(roster).find(
        ([, participant]) =>
          participant.metadata.handle === lookupHandle &&
          isAgentParticipantType(participant.metadata.type)
      );
      if (match) targetId = match[0];
    }
    try {
      await client.callMethod(targetId, "pause", { reason: "User interrupted execution" }).result;
    } catch (error) {
      console.warn("[Chat] Interrupt failed:", error);
      this.#setConnectionError(
        error instanceof Error
          ? `Couldn't stop the agent: ${error.message}`
          : "Couldn't stop the agent. Try again.",
        error
      );
    }
  }

  /** Cancel a running tool invocation. */
  async cancelInvocation(invocation: InvocationCardPayload, senderId: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    const cancelFailed = (error: unknown) =>
      this.#setConnectionError(
        error instanceof Error
          ? `Couldn't cancel the tool call: ${error.message}`
          : "Couldn't cancel the tool call. Try again.",
        error
      );
    // An `eval` runs server-side in the owning agent's EvalDO: route the
    // invocation coordinate through the agent that emitted it, which derives
    // the namespaced eval coordinate itself.
    if (invocation.name === "eval") {
      try {
        await client.callMethod(senderId, "cancelEval", { invocationId: invocation.id }).result;
      } catch (error) {
        console.warn("[Chat] Cancel eval failed:", error);
        cancelFailed(error);
      }
      return;
    }
    const transportCallId = invocation.transportCallId;
    if (!transportCallId) return;
    // Stop a method this participant is executing immediately; its abort path
    // publishes invocation.cancelled, which settles the caller.
    const abortedLocally = client.abortExecutingMethod(transportCallId);
    try {
      await client.cancelMethodCall(transportCallId);
    } catch (error) {
      if (!abortedLocally) {
        console.warn("[Chat] Cancel invocation failed:", error);
        cancelFailed(error);
      }
    }
  }

  /** Fire-and-forget method call (failures are logged). */
  callMethod(providerId: string, methodName: string, args: unknown): void {
    const client = this.client;
    if (!client) return;
    void client
      .callMethod(providerId, methodName, args)
      .result?.catch((error: unknown) =>
        console.error(`Failed to call method ${methodName} on ${providerId}:`, error)
      );
  }

  /** Call a participant method and return its result payload. */
  async callMethodResult(providerId: string, methodName: string, args: unknown): Promise<unknown> {
    const client = this.client;
    if (!client) throw new Error("Not connected to channel");
    const result = client.callMethod(providerId, methodName, args).result;
    return result ? await result : undefined;
  }

  // ===========================================================================
  // Agent badges and warnings
  // ===========================================================================

  addPendingAgent(handle: string, agentId: string): void {
    this.#cell.update((current) => {
      const next = new Map(current.pendingAgents);
      next.set(handle, { agentId, status: "starting" });
      return { pendingAgents: next };
    });
  }

  /** Mirror host-owned installed agents into pending badges until they join. */
  setPendingAgentInfos(agents: Array<{ handle: string; agentId: string }>): void {
    this.#cell.update((current) => {
      const next = new Map<string, PendingAgent>();
      for (const agent of agents) {
        const existing = current.pendingAgents.get(agent.handle);
        next.set(
          agent.handle,
          existing?.status === "error"
            ? { ...existing, agentId: agent.agentId }
            : { agentId: agent.agentId, status: "starting" }
        );
      }
      return { pendingAgents: next };
    });
  }

  removePendingAgent(handle: string): void {
    this.#cell.update((current) => {
      if (!current.pendingAgents.has(handle)) return {};
      const next = new Map(current.pendingAgents);
      next.delete(handle);
      return { pendingAgents: next };
    });
  }

  dismissDirtyWarning(agentName: string): void {
    this.#cell.update((current) => {
      const next = new Map(current.dirtyRepoWarnings);
      next.delete(agentName);
      return { dirtyRepoWarnings: next };
    });
  }

  // ===========================================================================

  #dispose(): void {
    this.#disposed = true;
    for (const release of this.#releaseSubStores.splice(0)) release();
    this.#loop?.abort(new Error("Chat session disposed"));
    this.#loop = null;
    if (this.#undoTimer) clearTimeout(this.#undoTimer);
    if (this.#flushTimer) clearTimeout(this.#flushTimer);
    this.#undoTimer = null;
    this.#flushTimer = null;
    this.#detachClient();
    this.feed.dispose();
    void this.#connection.disconnect().catch(() => {
      /* connection errors are surfaced through ConnectionManager */
    });
  }
}

const NO_AGENTS: AvailableAgent[] = [];

function withoutJoinedPendingAgents(
  pending: Map<string, PendingAgent>,
  roster: ChatParticipants
): Map<string, PendingAgent> {
  if (pending.size === 0) return pending;
  const handles = new Set(
    Object.values(roster).map((participant) => participant?.metadata?.handle as string | undefined)
  );
  let next: Map<string, PendingAgent> | null = null;
  for (const handle of pending.keys()) {
    if (handles.has(handle)) (next ??= new Map(pending)).delete(handle);
  }
  return next ?? pending;
}

function mergeParticipants(
  previous: ChatParticipants,
  departed: ChatParticipants,
  participants: ChatParticipants
): ChatParticipants {
  const merged = { ...departed, ...participants };
  const keys = Object.keys(merged);
  if (keys.length === Object.keys(previous).length && keys.every((key) => previous[key] === merged[key]))
    return previous;
  return merged;
}

