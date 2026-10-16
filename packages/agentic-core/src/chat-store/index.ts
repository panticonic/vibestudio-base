// =============================================================================
// @workspace/agentic-core/chat-store — the headless chat core.
//
// Framework-free stores that hold every piece of chat logic the chat panel,
// HeadlessSession and the terminal chat share. See README.md in this
// directory for the public API and how to build a UI on it.
// =============================================================================

export {
  RetainCount,
  StateCell,
  asError,
  errorMessage,
  shallowEqual,
  userFacingError,
} from "./store.js";
export type { ReadableStore, StoreListener, UserFacingError } from "./store.js";

export {
  ChannelViewFeed,
  DELTA_COALESCE_MS,
  TRANSCRIPT_PAGE_SIZE,
  sameChatMessage,
} from "./channel-view-feed.js";
export type {
  ChannelFeedClient,
  ChannelViewFeedOptions,
  ChannelViewFeedSnapshot,
  FollowableChannelClient,
} from "./channel-view-feed.js";

export { ChatMethodRegistry, composeChatMethods } from "./methods.js";
export type { ChatMethodProvider, ChatMethods } from "./methods.js";

export { connectionRetryDelayMs, isTransientConnectionFailure } from "./connection-retry.js";

export {
  ChatSession,
  FLUSH_NARRATION_MS,
  MAX_DEBUG_EVENTS,
  UNDO_WINDOW_MS,
  pruneAfterTurnIds,
  titleFromFirstUserMessage,
} from "./chat-session.js";
export type {
  ChatAgentHost,
  ChatParticipants,
  ChatReconnectReason,
  ChatSessionOptions,
  ChatSessionPorts,
  ChatSessionSnapshot,
  ConnectionErrorInfo,
  FlushNarration,
  PrimaryActionIntent,
  PublishTextOptions,
  SendOptions,
  UndoableAction,
} from "./chat-session.js";

// --- First-agent bootstrap (deferred-agent workstream) -----------------------
export * from "./deferred-agent/index.js";

// --- Lineage: forks, child transcripts, signals (lineage workstream) ---------
export * from "./lineage/index.js";

// --- Host controller (host workstream) ---------------------------------------
export * from "./host/index.js";

// The `chat` value rendered UI receives, shared by every chat client.
export { createChatSandboxValue, type ChatSandboxPorts } from "./sandbox-chat.js";
export {
  normalizeSandboxSendOptions,
  sendSandboxText,
  type SandboxSendOptions,
} from "./sandbox-send.js";
