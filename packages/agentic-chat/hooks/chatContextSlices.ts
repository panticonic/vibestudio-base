/**
 * The chat context is assembled from independently memoized slices instead of
 * one memo over every field: each slice is a pure projection of one source —
 * the session snapshot, the host actions, the browser feature hooks — and only
 * the slice whose source changed is rebuilt.
 */

import type { AgenticChatActions } from "@workspace/agentic-core";
import type { ChatSession, ChatSessionSnapshot } from "@workspace/agentic-core/chat-store";
import type { ChatContextValue } from "../types";
import { channelParticipantId } from "../types";

/** Session-owned state. Rebuilt only when the session snapshot changes. */
export function sessionStateSlice(snapshot: ChatSessionSnapshot) {
  return {
    connected: snapshot.connected,
    replaySettled: snapshot.replaySettled,
    status: snapshot.status,
    channelTitle: snapshot.channelTitle,
    connectionError: snapshot.connectionError,
    messages: snapshot.messages,
    hasMoreHistory: snapshot.hasMoreHistory,
    loadingMore: snapshot.loadingMore,
    selfId: snapshot.selfId ? channelParticipantId(snapshot.selfId) : null,
    participants: snapshot.participants,
    allParticipants: snapshot.allParticipants,
    debugEvents: snapshot.debugEvents,
    dirtyRepoWarnings: snapshot.dirtyRepoWarnings,
    pendingAgents: snapshot.pendingAgents,
    agentBusy: snapshot.agentBusy,
    hasOpenTurn: snapshot.hasOpenTurn,
    primaryActionIntent: snapshot.primaryActionIntent,
    flushNarration: snapshot.flushNarration,
    undoableAction: snapshot.undoableAction,
    pendingSendCount: snapshot.pendingSendCount,
    afterTurnMessageIds: snapshot.afterTurnMessageIds,
  } satisfies Partial<ChatContextValue>;
}

/** Session actions. Stable for the session's lifetime. */
export function sessionActionsSlice(session: ChatSession, clientRef: ChatContextValue["clientRef"]) {
  return {
    clientRef,
    dismissConnectionError: () => session.dismissConnectionError(),
    retryConnection: () => session.reconnect("user-retry"),
    editPendingMessage: (messageId: string, newText: string) =>
      session.editPendingMessage(messageId, newText),
    cancelPendingMessage: (messageId: string) => session.cancelPendingMessage(messageId),
    flushOutboxAndInterrupt: () => session.flushOutboxAndInterrupt(),
    undoLastAction: () => session.undoLastAction(),
    onLoadEarlierMessages: () => void session.loadEarlierMessages(),
    onInterrupt: (agentId: string, messageId?: string, agentHandle?: string) =>
      void session.interruptAgent(agentId, messageId, agentHandle),
    onCancelInvocation: (...args: Parameters<ChatSession["cancelInvocation"]>) =>
      void session.cancelInvocation(...args),
    onCallMethod: (providerId: string, methodName: string, args: unknown) =>
      session.callMethod(providerId, methodName, args),
    onCallMethodResult: (providerId: string, methodName: string, args: unknown) =>
      session.callMethodResult(providerId, methodName, args),
    onDismissDirtyWarning: (agentName: string) => session.dismissDirtyWarning(agentName),
  } satisfies Partial<ChatContextValue>;
}

/**
 * Host-supplied actions and catalog data. Agent management is bound to this
 * channel through the session; the rest passes through.
 */
export function hostContextSlice(session: ChatSession, actions: AgenticChatActions | undefined) {
  return {
    onAddAgent: actions?.onAddAgent ? session.addAgent : undefined,
    onReplaceAgent: actions?.onReplaceAgent ? session.replaceAgent : undefined,
    onPersistAgentModel: actions?.onPersistAgentModel ? session.persistAgentModel : undefined,
    onRemoveAgent: actions?.onRemoveAgent ? session.removeAgent : undefined,
    onInstallLocalModel: actions?.onInstallLocalModel,
    onConnectModelProvider: actions?.onConnectModelProvider,
    availableAgents: actions?.availableAgents,
    modelCatalog: actions?.modelCatalog,
    defaultModelRef: actions?.defaultModelRef,
    defaultAgentConfig: actions?.defaultAgentConfig,
    onSaveDefaults: actions?.onSaveDefaults,
    onFocusPanel: actions?.onFocusPanel,
    onReloadPanel: actions?.onReloadPanel,
    onOpenChannel: actions?.onOpenChannel,
    onNewConversation: actions?.onNewConversation,
    onListTaskRules: actions?.onListTaskRules,
    onResetTaskRules: actions?.onResetTaskRules,
    onOpenLocalModelsLog: actions?.onOpenLocalModelsLog,
    onOpenLocalModels: actions?.onOpenLocalModels,
  } satisfies Partial<ChatContextValue>;
}
