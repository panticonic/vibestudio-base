import { useCallback, useMemo, type ReactNode } from "react";
import { ResponseActionsProvider, type ResponseAnswer, type ResponseSendOptions } from "@workspace/ui/response";
import {
  ChatComposerRuntimeContext,
  ChatContext,
  ChatMessageActionsContext,
  type ChatComposerRuntimeValue,
  type ChatMessageActionsValue,
} from "./ChatContext";
import {
  ChatInputActionsContext,
  ChatInputContext,
  type ChatInputActionsValue,
} from "./ChatInputContext";
import type { ChatContextValue, ChatInputContextValue } from "../types";

export interface ChatProviderProps {
  value: ChatContextValue;
  inputValue: ChatInputContextValue;
  children: ReactNode;
}

/**
 * Provides chat state and handlers to all child components via React context.
 *
 * Keeps the public full contexts while publishing stable internal slices for
 * row actions and composer runtime. Transcript streaming and input keystrokes
 * therefore reach only consumers that use the changing projection.
 *
 * Also connects response-catalog controls (ActionButton, Choices) anywhere in
 * the chat — MDX messages, inline UI, feedback and action-bar components — to
 * this conversation: their messages are sent as the user, with any UI
 * `interaction` carried as message metadata.
 *
 * Usage:
 * ```tsx
 * const { contextValue, inputContextValue } = useAgenticChat({ config, channelName, tools });
 * <ChatProvider value={contextValue} inputValue={inputContextValue}>
 *   <ChatLayout features={features} />
 * </ChatProvider>
 * ```
 */
export function ChatProvider({ value, inputValue, children }: ChatProviderProps) {
  const messageActions = useMemo<ChatMessageActionsValue>(
    () => ({
      editPendingMessage: value.editPendingMessage,
      forkState: value.forkState,
      onNewConversation: value.onNewConversation,
      onPersistAgentModel: value.onPersistAgentModel,
      childTranscript: value.childTranscript,
      onOpenChannel: value.onOpenChannel,
      importLoader: value.importLoader,
    }),
    [
      value.editPendingMessage,
      value.forkState,
      value.onNewConversation,
      value.onPersistAgentModel,
      value.childTranscript,
      value.onOpenChannel,
      value.importLoader,
    ]
  );
  const composerRuntime = useMemo<ChatComposerRuntimeValue>(
    () => ({
      agentBusy: value.agentBusy,
      allParticipants: value.allParticipants,
      chat: value.chat,
      connected: value.connected,
      flushNarration: value.flushNarration,
      flushOutboxAndInterrupt: value.flushOutboxAndInterrupt,
      hasOpenTurn: value.hasOpenTurn,
      modelCatalog: value.modelCatalog,
      onCallMethodResult: value.onCallMethodResult,
      onReplaceAgent: value.onReplaceAgent,
      participants: value.participants,
      pendingSendCount: value.pendingSendCount,
      primaryActionIntent: value.primaryActionIntent,
      selfId: value.selfId,
      undoableAction: value.undoableAction,
      undoLastAction: value.undoLastAction,
    }),
    [
      value.agentBusy,
      value.allParticipants,
      value.chat,
      value.connected,
      value.flushNarration,
      value.flushOutboxAndInterrupt,
      value.hasOpenTurn,
      value.modelCatalog,
      value.onCallMethodResult,
      value.onReplaceAgent,
      value.participants,
      value.pendingSendCount,
      value.primaryActionIntent,
      value.selfId,
      value.undoableAction,
      value.undoLastAction,
    ]
  );
  const inputActions = useMemo<ChatInputActionsValue>(
    () => ({
      onInputChange: inputValue.onInputChange,
      setReplyTo: inputValue.setReplyTo,
    }),
    [inputValue.onInputChange, inputValue.setReplyTo]
  );

  const chat = value.chat;
  const sendResponse = useCallback(
    (text: string, options?: ResponseSendOptions) =>
      chat.send(text, options?.interaction ? { metadata: { interaction: options.interaction } } : undefined),
    [chat]
  );

  // Answered state is derived from the durable transcript, never from the
  // control that sent it, so it survives reloads and other devices.
  const messages = value.messages;
  const answer = useMemo(() => {
    const answers = new Map<string, ResponseAnswer>();
    for (const message of messages ?? []) {
      const interaction = message.interaction;
      if (!interaction || message.error || message.pending) continue;
      answers.set(`${interaction.source}\u0000${interaction.targetId}`, {
        text: message.content,
        ...(interaction.values ? { values: interaction.values } : {}),
      });
    }
    return (source: string, targetId: string) => answers.get(`${source}\u0000${targetId}`);
  }, [messages]);

  return (
    <ChatContext.Provider value={value}>
      <ChatMessageActionsContext.Provider value={messageActions}>
        <ChatComposerRuntimeContext.Provider value={composerRuntime}>
          <ChatInputActionsContext.Provider value={inputActions}>
            <ChatInputContext.Provider value={inputValue}>
              <ResponseActionsProvider send={sendResponse} answer={answer}>{children}</ResponseActionsProvider>
            </ChatInputContext.Provider>
          </ChatInputActionsContext.Provider>
        </ChatComposerRuntimeContext.Provider>
      </ChatMessageActionsContext.Provider>
    </ChatContext.Provider>
  );
}
