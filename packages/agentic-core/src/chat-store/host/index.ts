// Host workstream: the ChatHostController and the helpers/ports it is built on.
export {
  BOOTSTRAP_REVIEW_REPERSIST_MS,
  ChatHostController,
  DEFAULT_AGENT_CLASS_NAME,
  DEFAULT_AGENT_HANDLE,
  DEFAULT_AGENT_WORKER_SOURCE,
  LOCAL_MODEL_REFRESH_DEBOUNCE_MS,
  chatHostActionData,
} from "./chat-host-controller.js";
export type {
  ChatHostAgentActions,
  ChatHostModelPreflight,
  ChatHostSnapshot,
} from "./chat-host-controller.js";
export type {
  ChatHostConnectionPort,
  ChatHostNotification,
  ChatHostPorts,
  ChatHostRpc,
  ChatHostState,
  ChatHostStatePatch,
  ChatHostWorkspaceEvent,
  StateArgsPort,
} from "./ports.js";
export {
  appendInstalledAgent,
  buildAgentSubscriptionConfig,
  parseDoTargetId,
  requireChatContextId,
  sanitizeHandle,
} from "./installed-agents.js";
export type {
  BuildAgentSubscriptionConfigOptions,
  ChannelDORef,
  InstalledAgentRecord,
} from "./installed-agents.js";
export { createAndSubscribeAgent, persistInstalledAgent } from "./agent-lifecycle.js";
export { AgentRecoveryRunner, IDLE_RECOVERY, recoveryFailure } from "./agent-recovery.js";
export type {
  AgentRecoveryProgress,
  AgentRecoveryState,
  AgentRecoveryStatus,
  AgentRecoveryTask,
} from "./agent-recovery.js";
export { ownModelSettingsConnection, ownModelSettingsRequest } from "./model-settings-request.js";
export {
  CHAT_HOST_WORKSPACE_EVENT_NAMES,
  applyChatHostStatePatch,
  createChatHostPorts,
  createReviewWaiter,
  createStateArgsPort,
  createWorkspaceEventPort,
} from "./host-ports.js";
export type { ChatHostEventsClient, ChatHostPortsInput } from "./host-ports.js";
export { listChannelConversations } from "./conversation-listing.js";
export type { ChannelListing } from "./conversation-listing.js";
