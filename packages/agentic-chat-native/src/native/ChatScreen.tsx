/**
 * The native chat screen: conversation list, transcript and composer over one
 * `ChatConversationModel` (a `ChatHostController` + `ChatSession` pair driven
 * by `ChatHostPorts`). A client supplies ports, a connection, a palette and
 * the two host capabilities the transcript needs (open a link, render a panel
 * card); everything else is the shared chat core.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ClientParticipantMetadata, ConnectionConfig } from "@workspace/agentic-core";
import type { ChannelListing } from "@workspace/agentic-core/chat-store";
import type { QuickfireCard, QuickfireCardActionId } from "@workspace/quickfire-core";
import { QuickfireSkinProvider } from "@workspace/quickfire-core/ui";
import { chatComposerView } from "../model/composer.js";
import { conversationRows, type ConversationRow } from "../model/conversation-list.js";
import {
  ChatConversationModel,
  type ChatHostPortsFactory,
} from "../model/conversation-model.js";
import { chatTranscriptView } from "../model/transcript-view.js";
import { ChatTranscript, type RenderPanelCard } from "../ui/ChatTranscript.js";
import { ConversationList } from "../ui/ConversationList.js";
import { ChatComposer } from "./ChatComposer.js";
import { useChatNativeSkin, spacing } from "./skin.js";
import { lightChatNativeTheme, type ChatNativeTheme } from "./theme.js";
import { useOptionalStoreSnapshot, useStoreSnapshot } from "./useStore.js";

export interface ChatScreenProps {
  /** Ports for one conversation; called per conversation (each has its own state and instance id). */
  hostPorts: ChatHostPortsFactory;
  connection: ConnectionConfig;
  /** Workspace context a new chat starts in. */
  contextId: string;
  /** Open this conversation first; omitted starts a new chat. */
  channelName?: string | null;
  /** Text to place in the composer of the conversation this screen opens with (for example text shared into a new chat). */
  initialInput?: string;
  metadata?: ClientParticipantMetadata;
  theme?: ChatNativeTheme;
  /** Open a link from agent prose. */
  openLink: (href: string) => void;
  copy?: (text: string) => void | Promise<void>;
  /** Render an agent's inline-UI card (the client kit supplies a WebView card). */
  renderPanelCard?: RenderPanelCard;
}

type ListState = {
  rows: ConversationRow[];
  listings: ChannelListing[];
  loading: boolean;
  error: string | null;
};

export function ChatScreen({
  hostPorts,
  connection,
  contextId,
  channelName,
  initialInput,
  metadata,
  theme = lightChatNativeTheme,
  openLink,
  copy,
  renderPanelCard,
}: ChatScreenProps) {
  const model = useMemo(
    () =>
      new ChatConversationModel({
        hostPorts,
        connection,
        contextId,
        ...(channelName !== undefined ? { channelName } : {}),
        ...(initialInput ? { initialInput } : {}),
        ...(metadata ? { metadata } : {}),
      }),
    [hostPorts, connection, contextId, channelName, initialInput, metadata]
  );
  useEffect(() => model.retain(), [model]);

  const { controller, session } = useStoreSnapshot(model);
  const host = useStoreSnapshot(controller);
  const state = useOptionalStoreSnapshot(session);
  const forks = useOptionalStoreSnapshot(session?.forks ?? null);
  const skin = useChatNativeSkin(theme, { openLink, ...(copy ? { copy } : {}) });

  const [listOpen, setListOpen] = useState(false);
  const [list, setList] = useState<ListState>({ rows: [], listings: [], loading: false, error: null });
  const [sendError, setSendError] = useState<string | null>(null);

  const loadList = useCallback(() => {
    setList((current) => ({ ...current, loading: true, error: null }));
    model.listConversations().then(
      (listings) => setList((current) => ({ ...current, listings, loading: false })),
      (error: unknown) =>
        setList((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        }))
    );
  }, [model]);
  useEffect(() => {
    if (listOpen) loadList();
  }, [listOpen, loadList]);

  const rows = useMemo(
    () =>
      conversationRows({
        listings: list.listings,
        forks,
        currentChannelId: host.channelName,
      }),
    [list.listings, forks, host.channelName]
  );

  const transcript = useMemo(
    () => (state ? chatTranscriptView(state, { now: Date.now() }) : null),
    [state]
  );
  const composer = state ? chatComposerView(state) : null;

  const onAction = useCallback(
    (action: QuickfireCardActionId, _card: QuickfireCard, value?: string) => {
      if (action === "retry" && value && session) {
        void session.publishText(value).catch((error: unknown) => setSendError(messageOf(error)));
      }
    },
    [session]
  );

  const send = useCallback(() => {
    if (!session) return;
    setSendError(null);
    session.sendMessage().catch((error: unknown) => setSendError(messageOf(error)));
  }, [session]);

  const banner =
    sendError ??
    state?.connectionError?.message ??
    host.modelSettingsError?.message ??
    host.recovery.error?.message ??
    null;
  const retry = () => {
    setSendError(null);
    if (state?.connectionError) session?.reconnect("user-retry");
    if (host.modelSettingsError) controller.retryModelSettings();
    if (host.recovery.error) controller.retryAgentRecovery();
  };

  return (
    <QuickfireSkinProvider value={skin}>
      <KeyboardAvoidingView
        style={[styles.screen, { backgroundColor: theme.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.header, { borderBottomColor: theme.borderSubtle }]}>
          <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
            {state?.channelTitle ?? "New chat"}
          </Text>
          <HeaderButton theme={theme} label={listOpen ? "Close conversation list" : "Conversations"} onPress={() => setListOpen(!listOpen)}>
            {listOpen ? "Done" : "Chats"}
          </HeaderButton>
        </View>
        {banner ? (
          <View style={[styles.banner, { backgroundColor: theme.dangerSoft }]}>
            <Text style={{ color: theme.danger, flex: 1 }}>{banner}</Text>
            <HeaderButton theme={theme} label="Retry" onPress={retry}>
              Retry
            </HeaderButton>
          </View>
        ) : null}
        {listOpen ? (
          <ScrollView style={styles.body}>
            <ConversationList
              rows={rows}
              loading={list.loading}
              error={list.error}
              onRetry={loadList}
              onNew={() => {
                setListOpen(false);
                model.newConversation();
              }}
              onOpen={(row) => {
                setListOpen(false);
                model.openConversation(row.channelId, row.contextId);
              }}
            />
          </ScrollView>
        ) : (
          <>
            <ScrollView style={styles.body} contentContainerStyle={styles.transcript}>
              {transcript ? (
                <ChatTranscript
                  view={transcript}
                  onAction={onAction}
                  onLoadEarlier={() => void session?.loadEarlierMessages()}
                  {...(renderPanelCard ? { renderPanelCard } : {})}
                />
              ) : (
                <Text style={{ color: theme.textSecondary }}>Opening the conversation…</Text>
              )}
            </ScrollView>
            {session && state && composer ? (
              <ChatComposer
                theme={theme}
                value={state.input}
                view={composer}
                onChange={(value) => session.setInput(value)}
                onSend={send}
              />
            ) : null}
          </>
        )}
      </KeyboardAvoidingView>
    </QuickfireSkinProvider>
  );
}

function HeaderButton({
  theme,
  label,
  onPress,
  children,
}: {
  theme: ChatNativeTheme;
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={styles.headerButton}>
      <Text style={{ color: theme.accent, fontWeight: "600" }}>{children}</Text>
    </Pressable>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1, fontSize: 17, fontWeight: "700", paddingVertical: spacing.md },
  headerButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
  banner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md },
  body: { flex: 1 },
  transcript: { padding: spacing.md },
});
