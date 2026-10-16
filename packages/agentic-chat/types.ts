// ===========================================================================
// Re-export headless types from agentic-core
// ===========================================================================
export type {
  ChatParticipantMetadata,
  ChatParticipantSummary,
  ClientParticipantMetadata,
  ConnectionConfig,
  AgenticChatActions,
  ChatSandboxValue,
  ChatMethodResult,
  ToolProviderDeps,
  ToolProvider,
  NewConversationOptions,
  ModelSetupResult,
} from "@workspace/agentic-core";

// ===========================================================================
// Re-export derived UI types from agentic-core (ChatMessage, pending agent state, …)
// ===========================================================================
export type {
  ChatMessage,
  MessageTypeDefinition,
  PendingAgent,
  PendingAgentStatus,
  DisconnectedAgentInfo,
  DirtyRepoDetails,
} from "@workspace/agentic-core";

// ===========================================================================
// UI-only types
// ===========================================================================
import type {
  AgentDebugPayload,
  Participant,
  AttachmentInput,
  SandboxSource,
  PubSubClient,
} from "@workspace/pubsub";
import type { ActiveFeedback, ToolApprovalProps } from "@workspace/tool-ui";
import type { PendingImage } from "./utils/imageUtils";
import type { ComponentType, Dispatch, RefObject, SetStateAction } from "react";
import type {
  SandboxImportLoader,
  ScopeManager,
  ScopesApi,
} from "@workspace/eval";
import type { RpcFailure } from "@vibestudio/rpc";
import type { DefaultAgentConfig } from "@workspace/model-catalog/catalog";
import type { ChildTranscriptConnection } from "@workspace/agentic-core/chat-store";
import type {
  ChatParticipantMetadata,
  ChatSandboxValue,
  InvocationCardPayload,
} from "@workspace/agentic-core";
import type { ConsoleCapture } from "@workspace/eval";
import type {
  ChatMessage,
  MessageTypeDefinition,
  PendingAgent,
  DirtyRepoDetails,
  AvailableAgent,
  ModelSetupResult,
  ModelCatalog,
  AgentSubscriptionConfig,
  NewConversationOptions,
} from "@workspace/agentic-core";

// ===========================================================================
// Inline UI Component Entry
// ===========================================================================

export interface InlineUiComponentEntry {
  Component?: ComponentType<{
    props: Record<string, unknown>;
    chat: Record<string, unknown>;
    scope: Record<string, unknown>;
    scopes: Record<string, unknown>;
    inlineUi?: { id: string; renderedAt?: string };
  }>;
  cacheKey: string;
  error?: RpcFailure;
  runtime?: { console: ConsoleCapture };
}

// ===========================================================================
// Action Bar
// ===========================================================================

export interface ActionBarData {
  /** Unique ID for this action bar revision. New revisions replace old ones. */
  id: string;
  /** Component source to compile and render. */
  source: SandboxSource;
  /** Optional explicit imports for the current compiled revision. */
  imports?: Record<string, string>;
  /** Optional props to pass to the component */
  props?: Record<string, unknown>;
  /** Optional preferred maximum height in pixels. Clamped by the renderer. */
  maxHeight?: number;
  /** Participant that authored this bar; receives failure feedback. */
  author?: ActionBarAuthor;
  /** Agent turn whose `load_action_bar` call published this bar. */
  turnId?: string;
}

/** Who authored an action bar (the target of its `ui.feedback`). */
export interface ActionBarAuthor {
  kind: string;
  id: string;
  participantId?: string;
}

export interface ActionBarState {
  data: ActionBarData;
  component?: InlineUiComponentEntry;
}

// ===========================================================================
// Typing Indicators
// ===========================================================================

/** Typing indicator data derived from roster participant metadata. */
export interface TypingIndicatorData {
  senderId: string;
  senderName?: string;
  senderType?: string;
}

declare const runtimeCallerIdBrand: unique symbol;
declare const channelParticipantIdBrand: unique symbol;

export type RuntimeCallerId = string & {
  readonly [runtimeCallerIdBrand]: true;
};
export type ChannelParticipantId = string & {
  readonly [channelParticipantIdBrand]: true;
};
export type BrowserHandoffCallerKind = "client" | "panel" | "shell";

export interface BrowserHandoffCaller {
  id: RuntimeCallerId;
  kind: BrowserHandoffCallerKind;
}

export function runtimeCallerId(value: string): RuntimeCallerId {
  return value as RuntimeCallerId;
}

export function channelParticipantId(value: string): ChannelParticipantId {
  return value as ChannelParticipantId;
}

// ===========================================================================
// ChatInputContext Value
// ===========================================================================

export interface ChatInputContextValue {
  input: string;
  pendingImages: PendingImage[];
  onInputChange: (value: string) => void;
  onSendMessage: (
    attachments?: AttachmentInput[],
    options?: {
      mentions?: string[];
      replyTo?: string;
      /** Written into the published message payload (e.g. deliverAfterTurn). */
      metadata?: Record<string, unknown>;
    },
  ) => Promise<void>;
  onImagesChange: Dispatch<SetStateAction<PendingImage[]>>;
  replyTo: string | null;
  replyToMessage: ChatMessage | null;
  setReplyTo: (messageId: string | null) => void;
}

/** Delivery-model UI types (send intent, flush narration, undo window) live
 *  with the chat session in the core. */
export type {
  FlushNarration,
  PrimaryActionIntent,
  UndoableAction,
} from "@workspace/agentic-core/chat-store";
import type {
  FlushNarration,
  PrimaryActionIntent,
  UndoableAction,
} from "@workspace/agentic-core/chat-store";

// ===========================================================================
// Deferred agent — first-agent setup + pre-send delivery queue
// ===========================================================================

// The pending-delivery queue and first-agent flow state are owned by the
// headless DeferredAgentMachine; these are its public shapes.
export type {
  DeferredAgentState,
  PendingDelivery,
} from "@workspace/agentic-core/chat-store";
import type { DeferredAgentState } from "@workspace/agentic-core/chat-store";

// ===========================================================================
// Fork lineage UI (switcher, tree, inline rows, subagent review)
// ===========================================================================

/** Fork lineage UI types live with the `ForkLineageStore` in the core. */
export type {
  ChannelProvenance,
  ForkEntry,
  ForkNavHandlers,
  ForkTreeNode,
  ForkUiState,
} from "@workspace/agentic-core/chat-store";
import type { ForkUiState } from "@workspace/agentic-core/chat-store";

// ===========================================================================
// ChatContext Value
// ===========================================================================

export interface ChatContextValue {
  // Connection
  connected: boolean;
  /** True once the initial replay has settled — `messages` then reliably
   *  reflects prior history (distinct from socket connect). */
  replaySettled: boolean;
  status: string;
  channelId: string | null;
  /** Current user-visible channel title, updated with channel config changes. */
  channelTitle: string | null;
  /** Connected runtime caller that can receive OAuth browser handoff events. */
  browserHandoffCaller: BrowserHandoffCaller;
  sessionEnabled?: boolean;
  /**
   * Last connection-layer error surfaced by `ConnectionManager.onError`
   * (subscribe failure, event-stream rejection). Cleared on successful
   * reconnect. Rendered inline at the top of the chat by `ChatLayout`
   * so silent stalls become visibly broken.
   */
  connectionError: {
    message: string;
    at: number;
    cause?: unknown;
    /** What happened (user-facing); `message` is the next step. */
    title?: string;
    /** Technical detail for a "Details" disclosure. */
    detail?: string;
    /** Whether rejoining the conversation can help. */
    retryable?: boolean;
  } | null;
  /** Clear the current connectionError (e.g., after a retry). */
  dismissConnectionError?: () => void;
  /** Re-run the initial channel connection after a terminal failure. */
  retryConnection?: () => void;

  /** Chat API for sandboxed code */
  chat: ChatSandboxValue;
  clientRef: RefObject<PubSubClient<ChatParticipantMetadata> | null>;
  /** Stable panel identity used to isolate panel-local UI scopes. */
  panelScopeId: string;
  /** Panel-local UI scope shared by inline UI, feedback_custom, and action bar. */
  scope: Record<string, unknown>;
  /** Scope API for the panel-local UI scope. */
  scopes: ScopesApi;
  /** Scope manager for panel-local UI scope reactivity and persistence. */
  scopeManager: ScopeManager;

  // Messages
  messages: ChatMessage[];
  inlineUiComponents: Map<string, InlineUiComponentEntry>;
  messageTypeComponents: Map<string, MessageTypeComponentEntry>;
  actionBar: ActionBarState | null;
  onActionBarMaxHeightChange?: (
    maxHeight: number,
    options?: { saveState?: boolean },
  ) => void;
  hasMoreHistory: boolean;
  loadingMore: boolean;

  // Participants
  /** This client's participant ID */
  selfId: ChannelParticipantId | null;
  participants: Record<string, Participant<ChatParticipantMetadata>>;
  allParticipants: Record<string, Participant<ChatParticipantMetadata>>;

  // Agent state
  debugEvents: Array<AgentDebugPayload & { ts: number }>;
  debugConsoleAgent: string | null;
  dirtyRepoWarnings: Map<string, DirtyRepoDetails>;
  pendingAgents: Map<string, PendingAgent>;
  /** First-agent setup + pre-send delivery queue (only on agent-capable hosts). */
  deferredAgent?: DeferredAgentState;

  // Feedback
  activeFeedbacks: Map<string, ActiveFeedback>;

  // Theme
  theme: "light" | "dark";

  // --- Delivery model: outbox, send intent, flush, undo ---------------------
  /**
   * Whether any agent is currently mid-turn. Derived robustly by OR-ing every
   * busy signal (durable typing message, ephemeral roster typing, open turn) so
   * interrupt/steer affordances stay enabled across the whole turn.
   */
  agentBusy: boolean;
  /** Whether the channel has an open/waiting turn that can receive after-turn messages. */
  hasOpenTurn: boolean;
  /** Edit a still-unread outbox message (rebuilds text + attachment blocks). */
  editPendingMessage: (messageId: string, newText: string) => Promise<void>;
  /** Retract a still-unread outbox message; raises an Undo snackbar. */
  cancelPendingMessage: (messageId: string) => Promise<void>;
  /** Esc / "Send now": pause busy agents with flushDeferred and narrate it. */
  flushOutboxAndInterrupt: () => Promise<void>;
  /** What pressing Enter will do right now (drives the send-button label/hint). */
  primaryActionIntent: PrimaryActionIntent;
  /** Transient outcome of the last flush, for the inline pill + aria-live. */
  flushNarration?: FlushNarration;
  /** The short client-side undo window after retract/cancel. */
  undoableAction?: UndoableAction;
  /** Undo the pending undoable action (re-send the retracted message text). */
  undoLastAction?: () => void;
  /**
   * Transient count of locally-in-flight sends ("Sending…" ghost). Local UI
   * state only; never protocol state.
   */
  pendingSendCount: number;
  /** Message ids sent with after-turn intent — drives the outbox lane cue. */
  afterTurnMessageIds: Set<string>;

  // Handlers
  onLoadEarlierMessages: () => void;
  onInterrupt: (
    agentId: string,
    messageId?: string,
    agentHandle?: string,
  ) => void;
  onCancelInvocation: (
    invocation: InvocationCardPayload,
    senderId: string,
  ) => void;
  onCallMethod: (providerId: string, methodName: string, args: unknown) => void;
  /** Awaits and returns the provider's result payload (for settings UIs). */
  onCallMethodResult: (
    providerId: string,
    methodName: string,
    args: unknown,
  ) => Promise<unknown>;
  onFeedbackDismiss: (callId: string) => void;
  onFeedbackError: (callId: string, error: Error) => void;
  onDebugConsoleChange: (agentHandle: string | null) => void;
  onDismissDirtyWarning: (agentName: string) => void;

  // Optional actions (platform-specific)
  onListTaskRules?: () => Promise<
    Array<{
      id: string;
      capability: string;
      action: string;
      resource: string;
      decidedAt: number;
    }>
  >;
  onResetTaskRules?: () => Promise<number>;
  onAddAgent?: (agentId?: string, config?: AgentSubscriptionConfig) => void;
  /** Replace an existing agent (by participant id), reusing its handle. */
  onReplaceAgent?: (
    participantId: string,
    agentId?: string,
    config?: AgentSubscriptionConfig,
  ) => Promise<void> | void;
  /** Persist an agent's model choice for panel reload/recovery. */
  onPersistAgentModel?: (participantId: string, model: string) => Promise<void>;
  /** Start installing a local model; live progress arrives through modelCatalog. */
  onInstallLocalModel?: (modelRef: string) => Promise<ModelSetupResult>;
  /** Connect directly from the model picker, before an agent exists. */
  onConnectModelProvider?: (
    modelRef: string,
    method: string,
    browser: "internal" | "external",
    signal: AbortSignal,
    configuration?: Record<string, string>,
  ) => Promise<void>;
  availableAgents?: AvailableAgent[];
  /** Static pi model catalog; connection status merged in the UI. */
  modelCatalog?: ModelCatalog | null;
  /** Workspace default model ref ("provider:modelId") for new agents. */
  defaultModelRef?: string | null;
  /** Full workspace default agent config (model + behavior) for new agents. */
  defaultAgentConfig?: DefaultAgentConfig | null;
  /** Explicitly save the full default agent config (model + behavior) as the
   *  workspace default — the ONLY path that writes it. Wired to the "Save as
   *  defaults" control in the agent config UI. */
  onSaveDefaults?: (config: DefaultAgentConfig) => Promise<void> | void;
  onRemoveAgent?: (handle: string) => void;
  onFocusPanel?: (panelId: string) => void;
  onReloadPanel?: (panelId: string) => void;
  /** Find-or-open the chat panel for another channel, landing on an envelope
   *  when given (messaging plan §4.10). */
  onOpenChannel?: (
    channelId: string,
    opts?: { focusMessageId?: string },
  ) => Promise<void> | void;
  /** Start a fresh conversation (surfaced for the command palette). */
  onNewConversation?: (
    options?: NewConversationOptions,
  ) => void | Promise<void>;
  /** Open the Local Models panel focused on a server's log (item 6) — wired
   *  from a local model's red error dot in the picker. */
  onOpenLocalModelsLog?: (server: "utility" | "main") => void;
  /** Open the full Local Models manager. */
  onOpenLocalModels?: () => void;

  // Tool approval (optional)
  toolApproval?: ToolApprovalProps;

  /** Fork lineage state + actions (switcher, tree, inline rows, subagent
   *  review). Absent on hosts that don't wire fork navigation. */
  forkState?: ForkUiState;

  /**
   * Connection material letting a subagent run card lazily observe the child's
   * own task channel and render its real transcript inline. Absent on hosts
   * without a live connection (tests, static transcript views), where cards
   * fall back to the relayed progress feed.
   */
  childTranscript?: ChildTranscriptConnection;

  /**
   * The panel's import loader for agent-authored UI code. Inline UI, action
   * bars, feedback components, and MDX messages all resolve their imports
   * through it. Absent where the host wires no build-backed loader; host
   * modules in the panel's module map still resolve.
   */
  importLoader?: SandboxImportLoader;
}

/** Which await a loading message type is currently parked on. */
export type MessageTypeLoadingStage =
  | "fetching-definition"
  | "loading-source"
  | "compiling";

export type MessageTypeRegistryEntry =
  | {
      status: "ready";
      definition: MessageTypeDefinition;
      module: import("@workspace/agentic-core").MessageTypeModule;
      cacheKey: string;
    }
  | {
      status: "loading";
      /** Stage the load is parked on — makes an endless spinner self-describing. */
      stage?: MessageTypeLoadingStage;
      /** Epoch ms when this stage started. */
      startedAt?: number;
      /** Definition being compiled, when known (absent while fetching it). */
      definition?: MessageTypeDefinition;
    }
  | {
      status: "error";
      message: string;
      /** Registration seq the failure corresponds to (newer seqs recompile). */
      updatedAtSeq?: number;
      /** Definition that failed, when known. */
      definition?: MessageTypeDefinition;
      /** Re-attempt the fetch/compile that produced this error. */
      retry?: () => void;
    };

export type MessageTypeComponentEntry = MessageTypeRegistryEntry;
