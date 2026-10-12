/**
 * useChatCore — React binding of a `ChatSession`.
 *
 * All chat logic (connection, transcript, roster, outbox, composer draft) lives
 * in the framework-free `ChatSession` from `@workspace/agentic-core/chat-store`.
 * This hook owns the session's lifetime for one mounted chat (retain/release,
 * so StrictMode reuses it), supplies the browser host ports (document title,
 * attached-panel title, system appearance), keeps the browser-only composer
 * images, and exposes the snapshot in the shape the chat components consume.
 */

import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChannelConfig, ConversationInitialization, PubSubClient } from "@workspace/pubsub";
import type {
  ActionBarPayload,
  ChatMessage,
  ChatParticipantMetadata,
  ClientParticipantMetadata,
  ConnectionConfig,
  DirtyRepoDetails,
  InvocationCardPayload,
  MessageTypeDefinition,
  PendingAgent,
} from "@workspace/agentic-core";
import {
  ChatSession,
  type ChatAgentHost,
  type ChatParticipants,
  type ForkNavHandlers,
  type ChatSessionPorts,
  type ConnectionErrorInfo,
  type PublishTextOptions,
} from "@workspace/agentic-core/chat-store";
import type { AgentDebugPayload } from "@workspace/pubsub";
import { cleanupPendingImages, type PendingImage } from "../../utils/imageUtils";
import type {
  ChatInputContextValue,
  FlushNarration,
  PrimaryActionIntent,
  UndoableAction,
} from "../../types";
import { useRetainedStore, useStoreSnapshot } from "../useChatStore";

/**
 * Resolve the effective appearance when no explicit `theme` prop is passed.
 * Follows the system / centralized appearance via `prefers-color-scheme`, so a
 * light-mode user is never forced into dark by an embedder.
 */
export function resolveSystemTheme(): "light" | "dark" {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      /* fall through */
    }
  }
  return "light";
}

/** Browser host ports: the document title, mirrored to the attached panel when explicit. */
function browserSessionPorts(rpc: ConnectionConfig["rpc"]): ChatSessionPorts {
  return {
    presentTitle(title, { explicit }) {
      if (typeof document !== "undefined") document.title = title;
      if (!explicit) return;
      void rpc
        .call("main", mainRpcMethods["runtime.setTitle"], [title.trim(), { explicit: true }])
        .catch((err) =>
          console.warn("[useChatCore] Failed to mirror explicit channel title to panel:", err)
        );
    },
  };
}

export interface UseChatCoreOptions {
  config: ConnectionConfig;
  channelName: string;
  channelConfig?: ChannelConfig;
  contextId?: string;
  /** Panel LABEL only (WP6 §5) — the channel derives the authoritative human
   *  identity (`user:<userId>` + account handle) from the verified subject. */
  metadata?: ClientParticipantMetadata;
  theme?: "light" | "dark";
}

export interface ChatCoreState {
  /** The framework-free session behind this hook. */
  session: ChatSession;
  messages: ChatMessage[];
  initialization?: ConversationInitialization;

  connected: boolean;
  /** True once the initial replay has settled (messages reflects prior history). */
  replaySettled: boolean;
  status: string;
  connectionError: ConnectionErrorInfo | null;
  dismissConnectionError: () => void;
  client: PubSubClient<ChatParticipantMetadata> | null;
  /** Live view of the session's client (read-only). */
  clientRef: { readonly current: PubSubClient<ChatParticipantMetadata> | null };
  connectToChannel: ChatSession["connect"];

  participants: ChatParticipants;
  allParticipants: ChatParticipants;

  input: string;
  pendingImages: PendingImage[];
  handleInputChange: (value: string) => void;
  setPendingImages: React.Dispatch<React.SetStateAction<PendingImage[]>>;

  hasMoreHistory: boolean;
  loadingMore: boolean;
  loadEarlierMessages: () => Promise<void>;
  canonicalActionBar: ActionBarPayload | null;
  messageTypes: MessageTypeDefinition[];

  sendMessage: ChatInputContextValue["onSendMessage"];
  /** Publish text without touching the composer (deferred delivery, sandboxed UI). */
  publishText: (text: string, opts?: PublishTextOptions) => Promise<void>;
  /** Title the channel from the first user message, once. */
  maybeSetDefaultTitle: (text: string) => void;
  handleInterruptAgent: (agentId: string, messageId?: string, agentHandle?: string) => Promise<void>;
  handleCancelInvocation: (invocation: InvocationCardPayload, senderId: string) => Promise<void>;
  handleCallMethod: (providerId: string, methodName: string, args: unknown) => void;
  handleCallMethodResult: (providerId: string, methodName: string, args: unknown) => Promise<unknown>;

  debugEvents: Array<AgentDebugPayload & { ts: number }>;
  dirtyRepoWarnings: Map<string, DirtyRepoDetails>;
  pendingAgents: Map<string, PendingAgent>;
  addPendingAgent: (handle: string, agentId: string) => void;
  setPendingAgentInfos: (agents: Array<{ handle: string; agentId: string }>) => void;
  removePendingAgent: (handle: string) => void;
  onDismissDirtyWarning: (agentName: string) => void;

  selfId: string | null;
  sessionEnabled: boolean | undefined;
  channelName: string;
  channelTitle: string | null;
  theme: "light" | "dark";
  config: ConnectionConfig;

  agentBusy: boolean;
  hasOpenTurn: boolean;
  primaryActionIntent: PrimaryActionIntent;
  pendingSendCount: number;
  afterTurnMessageIds: Set<string>;
  flushNarration: FlushNarration | undefined;
  undoableAction: UndoableAction | undefined;
  editPendingMessage: (messageId: string, newText: string) => Promise<void>;
  cancelPendingMessage: (messageId: string) => Promise<void>;
  flushOutboxAndInterrupt: () => Promise<void>;
  undoLastAction: () => void;

  inputContextValue: ChatInputContextValue;
}

/**
 * Create and retain the session for one mounted chat. A session belongs to one
 * channel in one context; connection config and participant label are read
 * when it is created (like the connection they configure).
 */
export function useChatSession({
  config,
  channelName,
  channelConfig,
  contextId,
  metadata,
  agentHost,
  forkNav,
}: Omit<UseChatCoreOptions, "theme"> & {
  /** Host agent management; kept current with `setAgentHost`. */
  agentHost?: ChatAgentHost;
  /** Fork navigation; its presence when the session is created enables lineage. */
  forkNav?: ForkNavHandlers;
}): ChatSession {
  const latest = useRef({ config, channelConfig, metadata, agentHost, forkNav });
  latest.current = { config, channelConfig, metadata, agentHost, forkNav };
  const session = useRetainedStore(() => {
    const current = latest.current;
    return new ChatSession({
      config: current.config,
      channelName,
      ...(current.channelConfig ? { channelConfig: current.channelConfig } : {}),
      ...(contextId ? { contextId } : {}),
      metadata: current.metadata ?? { name: channelName, type: "panel" },
      ports: browserSessionPorts(current.config.rpc),
      ...(current.agentHost ? { agentHost: current.agentHost } : {}),
      ...(current.forkNav ? { forkNav: current.forkNav } : {}),
    });
  }, [channelName, contextId]);
  // Host inputs are committed render state: apply them before paint, so the
  // first-agent flow never paints a frame computed from stale host data.
  useLayoutEffect(() => {
    session.setAgentHost(agentHost ?? {});
  }, [session, agentHost]);
  useLayoutEffect(() => {
    if (forkNav) session.setForkNav(forkNav);
  }, [session, forkNav]);
  // A changed creation config applies to the next join (and retries a stalled one).
  useEffect(() => {
    session.setChannelConfig(channelConfig);
  }, [session, channelConfig]);
  return session;
}

export function useChatCore(options: UseChatCoreOptions): ChatCoreState {
  const session = useChatSession(options);
  return useChatCoreState(session, options);
}

/** Expose a session's snapshot in the `ChatCoreState` shape. */
export function useChatCoreState(
  session: ChatSession,
  { config, channelName, theme: themeProp }: Pick<UseChatCoreOptions, "config" | "channelName" | "theme">
): ChatCoreState {
  const snapshot = useStoreSnapshot(session);
  // Appearance flows from the explicit prop OR the system appearance.
  const theme: "light" | "dark" = themeProp ?? resolveSystemTheme();

  // Composer images hold browser object URLs; they stay React-side.
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const pendingImagesRef = useRef(pendingImages);
  pendingImagesRef.current = pendingImages;
  useEffect(() => () => cleanupPendingImages(pendingImagesRef.current), []);
  // The session clears the composer (e.g. when the first-agent flow holds a
  // message); the image tray is the browser-owned half of the composer.
  useEffect(() => session.onComposerCleared(() => setPendingImages([])), [session]);

  const actions = useMemo(
    () => ({
      clientRef: {
        get current() {
          return session.client;
        },
      },
      connectToChannel: session.connect.bind(session),
      dismissConnectionError: () => session.dismissConnectionError(),
      handleInputChange: (value: string) => session.setInput(value),
      setReplyTo: (messageId: string | null) => session.setReplyTo(messageId),
      loadEarlierMessages: () => session.loadEarlierMessages(),
      sendMessage: ((attachments, sendOptions) =>
        session.sendMessage(attachments, sendOptions)) as ChatInputContextValue["onSendMessage"],
      publishText: (text: string, opts?: PublishTextOptions) => session.publishText(text, opts),
      maybeSetDefaultTitle: (text: string) => session.maybeSetDefaultTitle(text),
      handleInterruptAgent: (agentId: string, messageId?: string, agentHandle?: string) =>
        session.interruptAgent(agentId, messageId, agentHandle),
      handleCancelInvocation: (invocation: InvocationCardPayload, senderId: string) =>
        session.cancelInvocation(invocation, senderId),
      handleCallMethod: (providerId: string, methodName: string, args: unknown) =>
        session.callMethod(providerId, methodName, args),
      handleCallMethodResult: (providerId: string, methodName: string, args: unknown) =>
        session.callMethodResult(providerId, methodName, args),
      addPendingAgent: (handle: string, agentId: string) => session.addPendingAgent(handle, agentId),
      setPendingAgentInfos: (agents: Array<{ handle: string; agentId: string }>) =>
        session.setPendingAgentInfos(agents),
      removePendingAgent: (handle: string) => session.removePendingAgent(handle),
      onDismissDirtyWarning: (agentName: string) => session.dismissDirtyWarning(agentName),
      editPendingMessage: (messageId: string, newText: string) =>
        session.editPendingMessage(messageId, newText),
      cancelPendingMessage: (messageId: string) => session.cancelPendingMessage(messageId),
      flushOutboxAndInterrupt: () => session.flushOutboxAndInterrupt(),
      undoLastAction: () => session.undoLastAction(),
    }),
    [session]
  );

  const inputContextValue = useMemo<ChatInputContextValue>(
    () => ({
      input: snapshot.input,
      pendingImages,
      onInputChange: actions.handleInputChange,
      onSendMessage: actions.sendMessage,
      onImagesChange: setPendingImages,
      replyTo: snapshot.replyTo,
      replyToMessage: snapshot.replyTo
        ? (snapshot.messages.find((message) => message.id === snapshot.replyTo) ?? null)
        : null,
      setReplyTo: actions.setReplyTo,
    }),
    [snapshot.input, snapshot.replyTo, snapshot.messages, pendingImages, actions]
  );

  return {
    session,
    messages: snapshot.messages,
    initialization: snapshot.initialization,
    connected: snapshot.connected,
    replaySettled: snapshot.replaySettled,
    status: snapshot.status,
    connectionError: snapshot.connectionError,
    dismissConnectionError: actions.dismissConnectionError,
    client: snapshot.client,
    clientRef: actions.clientRef,
    connectToChannel: actions.connectToChannel,
    participants: snapshot.participants,
    allParticipants: snapshot.allParticipants,
    input: snapshot.input,
    pendingImages,
    handleInputChange: actions.handleInputChange,
    setPendingImages,
    hasMoreHistory: snapshot.hasMoreHistory,
    loadingMore: snapshot.loadingMore,
    loadEarlierMessages: actions.loadEarlierMessages,
    canonicalActionBar: snapshot.actionBar,
    messageTypes: snapshot.messageTypes,
    sendMessage: actions.sendMessage,
    publishText: actions.publishText,
    maybeSetDefaultTitle: actions.maybeSetDefaultTitle,
    handleInterruptAgent: actions.handleInterruptAgent,
    handleCancelInvocation: actions.handleCancelInvocation,
    handleCallMethod: actions.handleCallMethod,
    handleCallMethodResult: actions.handleCallMethodResult,
    debugEvents: snapshot.debugEvents,
    dirtyRepoWarnings: snapshot.dirtyRepoWarnings,
    pendingAgents: snapshot.pendingAgents,
    addPendingAgent: actions.addPendingAgent,
    setPendingAgentInfos: actions.setPendingAgentInfos,
    removePendingAgent: actions.removePendingAgent,
    onDismissDirtyWarning: actions.onDismissDirtyWarning,
    selfId: snapshot.selfId,
    // Always persistent: transcript state is projected from the durable log.
    sessionEnabled: true,
    channelName,
    channelTitle: snapshot.channelTitle,
    theme,
    config,
    agentBusy: snapshot.agentBusy,
    hasOpenTurn: snapshot.hasOpenTurn,
    primaryActionIntent: snapshot.primaryActionIntent,
    pendingSendCount: snapshot.pendingSendCount,
    afterTurnMessageIds: snapshot.afterTurnMessageIds,
    flushNarration: snapshot.flushNarration,
    undoableAction: snapshot.undoableAction,
    editPendingMessage: actions.editPendingMessage,
    cancelPendingMessage: actions.cancelPendingMessage,
    flushOutboxAndInterrupt: actions.flushOutboxAndInterrupt,
    undoLastAction: actions.undoLastAction,
    inputContextValue,
  };
}
