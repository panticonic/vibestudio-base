/**
 * Agentic Chat Panel
 *
 * A thin React adapter over the framework-free `ChatHostController`
 * (`@workspace/agentic-core/chat-store`): the controller owns the channel
 * bootstrap, model settings, agent catalog, installed-agent persistence and
 * recovery over this panel's runtime ports; this file renders its snapshot and
 * composes the panel-only navigation actions (new conversation, fork switching,
 * other panels).
 */

import {
  contextId,
  rpc,
  panel,
  buildPanelLink,
  openPanel,
  getPanelHandle,
  notifications,
  extensions,
} from "@workspace/runtime";
import { EventsClient } from "@vibestudio/service-schemas/clients/eventsClient";
import { SHELL_APPROVAL_PENDING_CHANGED_EVENT } from "@vibestudio/shell-core/approvalState";
import { recoveryCoordinator } from "@workspace/runtime/internal/diagnostics";
import { createRuntimeScopeRehydrators } from "@workspace/runtime/panel-runtime";
import { useStateArgs } from "@workspace/react/hooks";
import { getVibestudioHostPlatform } from "@workspace/react/responsive";
import { usePanelTheme, usePanelThemeConfig } from "@workspace/react/theme";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { Button, Callout, Flex, Spinner, Text, Theme } from "@radix-ui/themes";
import { ErrorBoundary } from "@workspace/agentic-chat/error-boundary";
import { FULL_AGENTIC_CHAT_FEATURES } from "@workspace/agentic-chat/features";
import type {
  ConnectionConfig,
  AgenticChatActions,
  ForkNavHandlers,
  NewConversationOptions,
} from "@workspace/agentic-chat/types";
import "@workspace/ui/foundation.css";
import "@workspace/ui/themes/vibestudio.css";
import { createPanelImportLoader } from "@workspace/agentic-core/panel-import-loader";
import {
  ChatHostController,
  chatHostActionData,
  requireChatContextId,
  type ChatHostPorts,
  type ChatHostSnapshot,
  type ChatHostState,
  type UserFacingError,
} from "@workspace/agentic-core/chat-store";
import { waitForApprovalResolution } from "@workspace/pubsub";
import { LOCAL_MODELS_EXTENSION_ID } from "@workspace/model-catalog/catalog";
import type { ServerKind } from "@workspace/model-catalog/localModels";
import { localModelsExtensionMethods } from "@workspace/model-catalog/localModels";
import {
  ConversationHeader,
  conversationStyle,
  renderConversationEmptyState,
  type ConversationPresentation,
} from "./conversationPresentation.js";
import "./conversationPresentation.css";

const AgenticChat = lazy(() =>
  import("@workspace/agentic-chat/chat").then((module) => ({
    default: module.AgenticChat,
  })),
);

/** Chat panel state args: the host-controller state plus panel presentation. */
interface ChatStateArgs extends ChatHostState {
  seed?: import("@workspace/pubsub").ConversationSeed;
  channelConfig?: Record<string, unknown>;
  /** Envelope to scroll to and highlight once it is in the transcript — set by
   *  notification surfaces and other channels' open links (messaging plan §4.5,
   *  §4.10). Consumed (cleared) once honoured. */
  focusMessageId?: string;
  /** Context-relative TSX file to load into the panel-local action bar */
  actionBarFile?: string | null;
  /** Props for actionBarFile */
  actionBarProps?: Record<string, unknown> | null;
  /** Preferred max height for actionBarFile */
  actionBarMaxHeight?: number | null;
  /** Product-owned conversation framing. The canonical chat mechanics remain unchanged. */
  presentation?: ConversationPresentation;
  /** Stable participant recipients for unmentioned player messages. */
  defaultRecipients?: string[];
}

const STATE_ARGS_CHANGED_EVENT = "vibestudio:stateArgsChanged";

/** Back the controller's ports with this panel's runtime. */
function createPanelHostPorts(resolvedContextId: string): ChatHostPorts {
  const workspaceEvents = new EventsClient(rpc);
  const waitForReview = (approvalId: string) => waitForApprovalResolution(rpc, approvalId);
  return {
    rpc,
    contextId: resolvedContextId,
    state: {
      get: () => panel.stateArgs.get<ChatStateArgs>(),
      patch: async (partial) => {
        await panel.stateArgs.patch(partial);
      },
      subscribe: (listener) => {
        window.addEventListener(STATE_ARGS_CHANGED_EVENT, listener);
        return () => window.removeEventListener(STATE_ARGS_CHANGED_EVENT, listener);
      },
    },
    waitForReview: async (approvalId) => {
      await waitForReview(approvalId);
    },
    connection: rpc,
    notify: (notification) => notifications.show(notification),
    onWorkspaceEvent: (event, handler) => {
      const name =
        event === "approvals-changed"
          ? SHELL_APPROVAL_PENDING_CHANGED_EVENT
          : event === "units-changed"
            ? "workspace:units-changed"
            : "workspace:config-changed";
      const off = workspaceEvents.on(name, handler);
      void workspaceEvents.subscribe(name);
      return () => {
        off();
        void workspaceEvents.unsubscribe(name);
      };
    },
    localModels: {
      installModel: async (modelRef) => {
        await extensions.invoke(LOCAL_MODELS_EXTENSION_ID, "installModel", [modelRef]);
      },
      onChange: (handler) => {
        const subscriptions = [
          extensions.on(LOCAL_MODELS_EXTENSION_ID, "models.changed", handler),
          extensions.on(LOCAL_MODELS_EXTENSION_ID, "server.state", handler),
          extensions.on(LOCAL_MODELS_EXTENSION_ID, "download.progress", handler),
        ];
        return () => {
          for (const subscription of subscriptions) subscription.dispose();
        };
      },
    },
    recoveryCoordinator,
    instanceId: panel.slotId,
  };
}

/** Create the panel's controller and hold it while mounted. Construction is
 *  side-effect free; live work starts on the first retain, and the deferred
 *  release lets StrictMode's remount reuse the same instance. */
function useChatHost(resolvedContextId: string): ChatHostController {
  const controller = useMemo(
    () => new ChatHostController(createPanelHostPorts(resolvedContextId)),
    [resolvedContextId],
  );
  useEffect(() => controller.retain(), [controller]);
  return controller;
}

export default function ChatPanel() {
  const theme = usePanelTheme();
  const appTheme = usePanelThemeConfig();
  // A chat creates agents in its workspace context; without one there is
  // nothing to run. Say so instead of throwing during render.
  if (!contextId?.trim()) {
    return (
      <ErrorBoundary surfaceName="chat panel">
        <Theme appearance={theme} {...appTheme}>
          <Flex
            direction="column"
            align="center"
            justify="center"
            gap="2"
            style={{ minHeight: "100dvh", padding: 24, textAlign: "center" }}
          >
            <Text size="3" weight="medium">
              This chat isn't attached to a workspace
            </Text>
            <Text size="2" color="gray" style={{ maxWidth: 420 }}>
              Chats run their agents inside a workspace. Close this panel and
              open a new chat from your workspace.
            </Text>
          </Flex>
        </Theme>
      </ErrorBoundary>
    );
  }
  return <ChatPanelInContext contextId={contextId} theme={theme} appTheme={appTheme} />;
}

function ChatPanelInContext({
  contextId: panelContextId,
  theme,
  appTheme,
}: {
  contextId: string;
  theme: ReturnType<typeof usePanelTheme>;
  appTheme: ReturnType<typeof usePanelThemeConfig>;
}) {
  const stateArgs = useStateArgs<ChatStateArgs>();
  const resolvedContextId = requireChatContextId(panelContextId);
  const controller = useChatHost(resolvedContextId);
  const host = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const channelName = host.channelName;
  const creationChannelConfig = useMemo(
    () => ({ ...stateArgs.channelConfig, seed: stateArgs.seed }),
    [stateArgs.channelConfig, stateArgs.seed],
  );

  // Build ConnectionConfig from runtime
  const config = useMemo<ConnectionConfig>(
    () => ({
      clientId: panel.slotId,
      rpc,
      recoveryCoordinator,
      scopeRehydrators: createRuntimeScopeRehydrators(getPanelHandle),
    }),
    [],
  );

  const handleNewConversation = useCallback(
    (options?: NewConversationOptions) => {
      const nextStateArgs: ChatStateArgs = {};
      if (options?.seed) nextStateArgs.seed = options.seed;
      if (options?.agentConfig) nextStateArgs.agentConfig = options.agentConfig;
      const hasStateArgs = Object.keys(nextStateArgs).length > 0;
      const stateArgsForLink: Record<string, unknown> = { ...nextStateArgs };
      window.location.href = buildPanelLink(
        "panels/chat",
        hasStateArgs ? { stateArgs: stateArgsForLink } : undefined,
      );
    },
    [],
  );

  const handleFocusPanel = useCallback((panelId: string) => {
    void panel.focusPanel(panelId);
  }, []);

  const handleReloadPanel = useCallback(async (panelId: string) => {
    await panel.focusPanel(panelId);
    window.location.reload();
  }, []);

  // Once the transcript has landed on the requested envelope, drop the request
  // from the panel's own stateArgs so it does not replay on remount.
  const handleFocusMessageConsumed = useCallback((messageId: string) => {
    if (panel.stateArgs.get<ChatStateArgs>().focusMessageId !== messageId)
      return;
    void panel.stateArgs.patch({ focusMessageId: null }).catch(() => undefined);
  }, []);

  const handleOpenChannel = useCallback(
    async (targetChannelId: string, opts?: { focusMessageId?: string }) => {
      const { openChannelPanel } = await import("./openChannelPanel");
      await openChannelPanel(targetChannelId, opts);
    },
    [],
  );

  const openLocalModelsCapability = useCallback(async (server?: ServerKind) => {
    try {
      const capabilities =
        localModelsExtensionMethods.capabilities.result.parse(
          await extensions.invoke(
            LOCAL_MODELS_EXTENSION_ID,
            localModelsExtensionMethods.capabilities.method,
            [],
          ),
        );
      const target = server
        ? capabilities.serverLogs[server]
        : capabilities.managementPanel;
      await openPanel(target.source, {
        focus: true,
        ...(target.stateArgs ? { stateArgs: target.stateArgs } : {}),
      });
    } catch (err) {
      void notifications.show({
        type: "error",
        title: "Local Models unavailable",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);
  const handleOpenLocalModelsLog = useCallback(
    (server: ServerKind) => {
      void openLocalModelsCapability(server);
    },
    [openLocalModelsCapability],
  );
  const handleOpenLocalModels = useCallback(() => {
    void openLocalModelsCapability();
  }, [openLocalModelsCapability]);

  const handleActionBarFileChange = useCallback(
    (value: {
      path: string | null;
      props?: Record<string, unknown>;
      maxHeight?: number;
    }) => {
      void panel.stateArgs.patch({
        actionBarFile: value.path,
        actionBarProps: value.path ? (value.props ?? null) : null,
        actionBarMaxHeight: value.path ? (value.maxHeight ?? null) : null,
      });
    },
    [],
  );

  const chatActions: AgenticChatActions = useMemo(
    () => ({
      ...controller.actions,
      ...chatHostActionData(host),
      onNewConversation: handleNewConversation,
      onFocusPanel: handleFocusPanel,
      onReloadPanel: handleReloadPanel,
      onOpenChannel: handleOpenChannel,
      onOpenLocalModelsLog: handleOpenLocalModelsLog,
      onOpenLocalModels: handleOpenLocalModels,
      onAttentionRequired: (title, message) => {
        void notifications.show({
          type: "warning",
          title,
          message,
        });
      },
    }),
    [
      controller,
      host.availableAgents,
      host.modelCatalog,
      host.workspaceDefaultModelRef,
      host.effectiveDefaultAgentConfig,
      host.firstAgentModelPreflight,
      handleNewConversation,
      handleFocusPanel,
      handleReloadPanel,
      handleOpenChannel,
      handleOpenLocalModelsLog,
      handleOpenLocalModels,
    ],
  );

  // In-place fork switch: explicitly move the panel runtime to the fork's
  // already-created workspace branch. State args carry only the channel.
  const handleForkSwitch = useCallback(
    async (forkChannelId: string, forkContextId: string) => {
      console.info("[ChatPanel] switching to fork", {
        fromChannelId: channelName,
        fromContextId: resolvedContextId,
        forkChannelId,
        forkContextId,
      });
      const current = panel.stateArgs.get<
        ChatStateArgs & { contextId?: unknown }
      >();
      const { contextId: _obsoleteContextId, ...panelState } = current;
      // A fork's agents are its own clones: adopt the fork's roster, never the
      // source conversation's installed-agent keys (Identity collision).
      const conversation = await controller.conversationState(forkChannelId);
      await panel.switchContext(forkContextId, {
        stateArgs: { ...panelState, ...conversation },
      });
    },
    [channelName, resolvedContextId, controller],
  );

  // Side-by-side: open the fork in a fresh chat panel (news-panel shape).
  const handleOpenForkPanel = useCallback(
    async (forkChannelId: string, forkContextId: string) => {
      console.info("[ChatPanel] opening fork panel", {
        fromChannelId: channelName,
        fromContextId: resolvedContextId,
        forkChannelId,
        forkContextId,
      });
      await openPanel("panels/chat", {
        focus: true,
        contextId: forkContextId,
        stateArgs: { channelName: forkChannelId },
      });
    },
    [channelName, resolvedContextId],
  );

  // Hand external-fork notification policy to the shell, which owns the real
  // panel/window focus state.
  const handleExternalFork = useCallback(
    async (fork: {
      forkedChannelId: string;
      forkedContextId: string;
      actorName: string;
      forkPointId: number;
    }) => {
      await notifications.show({
        type: "info",
        title: "Conversation forked",
        message: `${fork.actorName} forked from message ${fork.forkPointId}`,
        actions: [
          {
            label: "Switch",
            variant: "solid",
            onClick: () => {
              void (async () => {
                try {
                  await handleForkSwitch(
                    fork.forkedChannelId,
                    fork.forkedContextId,
                  );
                } catch (cause) {
                  const message =
                    cause instanceof Error ? cause.message : String(cause);
                  try {
                    await notifications.show({
                      type: "error",
                      title: "Couldn't switch conversations",
                      message,
                    });
                  } catch (notificationCause) {
                    console.error(
                      "[ChatPanel] failed to switch from fork notification and show the error",
                      { cause, notificationCause },
                    );
                  }
                }
              })();
            },
          },
        ],
      });
    },
    [handleForkSwitch],
  );

  const forkNav: ForkNavHandlers = useMemo(
    () => ({
      switchTo: handleForkSwitch,
      openInNewPanel: handleOpenForkPanel,
      readForkCursors: () => controller.readForkCursors(),
      markForkRead: (forkChannelId, headSeq) =>
        controller.markForkRead(forkChannelId, headSeq),
      onExternalFork: handleExternalFork,
    }),
    [controller, handleForkSwitch, handleOpenForkPanel, handleExternalFork],
  );

  const importLoader = useMemo(
    () =>
      createPanelImportLoader(rpc, {
        defaultWorkspaceRef: () => `ctx:${resolvedContextId}`,
      }),
    [resolvedContextId],
  );

  const panelMetadata = useMemo(
    () => ({
      name: channelName ?? "Channel",
      type: "panel" as const,
      hostPlatform: getVibestudioHostPlatform(),
    }),
    [channelName],
  );
  const installedAgents = stateArgs.installedAgents ?? undefined;
  const presentation = stateArgs.presentation;

  // Still bootstrapping — show a brief loading indicator
  if (!channelName) {
    return (
      <ErrorBoundary surfaceName="chat panel">
        <Theme appearance={theme} {...appTheme}>
          <Flex
            align="center"
            justify="center"
            style={{
              minHeight: "100dvh",
              width: "100vw",
              maxWidth: "100%",
              boxSizing: "border-box",
              padding: 16,
              overflow: "hidden",
            }}
          >
            <Flex align="center" gap="2">
              <Spinner size="1" />
              <Text size="2" color="gray">
                Starting chat…
              </Text>
            </Flex>
          </Flex>
        </Theme>
      </ErrorBoundary>
    );
  }
  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <Theme appearance={theme} {...appTheme}>
        {host.modelSettingsError ? (
          <HostFailureCallout
            failure={host.modelSettingsError}
            onRetry={() => controller.retryModelSettings()}
          />
        ) : null}
        {host.agentCatalogError ? (
          <HostFailureCallout
            failure={host.agentCatalogError}
            onRetry={() => controller.retryAgentCatalog()}
          />
        ) : null}
        {host.recovery.status === "failed" && host.recovery.error ? (
          <HostFailureCallout
            failure={host.recovery.error}
            onRetry={() => controller.retryAgentRecovery()}
          />
        ) : host.recovery.status === "recovering" ? (
          <Callout.Root color="blue" size="1" style={{ borderRadius: 0 }}>
            <Flex align="center" gap="2" width="100%">
              <Spinner size="1" />
              <Callout.Text>{recoveringText(host.recovery)}</Callout.Text>
            </Flex>
          </Callout.Root>
        ) : null}
      </Theme>
      <div style={{ flex: "1 1 0", minHeight: 0, overflow: "hidden" }}>
        <Suspense
          fallback={
            <Theme appearance={theme} {...appTheme}>
              <Flex align="center" justify="center" style={{ height: "100%" }}>
                <Spinner size="1" />
              </Flex>
            </Theme>
          }
        >
          <AgenticChat
            heightMode="container"
            className={presentation ? "immersive-conversation" : undefined}
            style={conversationStyle(presentation)}
            config={config}
            channelName={channelName}
            channelConfig={creationChannelConfig}
            contextId={resolvedContextId}
            metadata={panelMetadata}
            actions={chatActions}
            theme={theme}
            installedAgents={installedAgents}
            forkNav={forkNav}
            features={FULL_AGENTIC_CHAT_FEATURES}
            importLoader={importLoader}
            initialActionBarFile={stateArgs.actionBarFile ?? undefined}
            initialActionBarProps={stateArgs.actionBarProps ?? undefined}
            initialActionBarMaxHeight={
              stateArgs.actionBarMaxHeight ?? undefined
            }
            onActionBarFileChange={handleActionBarFileChange}
            connectionRetrySignal={host.connectionRetrySignal}
            focusMessageId={stateArgs.focusMessageId}
            onFocusMessageConsumed={handleFocusMessageConsumed}
            renderHeader={
              presentation
                ? () => <ConversationHeader presentation={presentation} />
                : undefined
            }
            renderEmptyState={
              presentation
                ? (defaultContent, state) =>
                    renderConversationEmptyState(
                      presentation,
                      defaultContent,
                      state.phase,
                    )
                : undefined
            }
            composerPlaceholder={presentation?.composerPlaceholder}
            composerDefaultMentions={stateArgs.defaultRecipients}
            composerDisabled={
              Boolean(stateArgs.defaultRecipients?.length) &&
              host.recovery.status !== "idle"
            }
          />
        </Suspense>
      </div>
    </div>
  );
}

function recoveringText(recovery: ChatHostSnapshot["recovery"]): string {
  const who =
    recovery.missing.length === 0
      ? "your agent"
      : recovery.missing.length === 1
        ? `@${recovery.missing[0]}`
        : `${recovery.missing.length} agents`;
  const verb = recovery.missing.length === 0 ? "Checking" : "Reconnecting";
  const retry = recovery.attempt > 1 ? ` (attempt ${recovery.attempt})` : "";
  return `${verb} ${who} to this conversation…${retry}`;
}

/** A host failure: what happened, the next step, Retry, and the technical detail on request. */
function HostFailureCallout({
  failure,
  onRetry,
}: {
  failure: UserFacingError;
  onRetry: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);
  return (
    <Callout.Root color="red" size="1" style={{ borderRadius: 0 }} role="alert">
      <Flex direction="column" gap="1" width="100%">
        <Flex align="center" justify="between" gap="3" width="100%">
          <Callout.Text>
            <Text weight="medium">{failure.title}.</Text> {failure.message}
          </Callout.Text>
          <Flex gap="2" flexShrink="0">
            {failure.detail ? (
              <Button
                size="1"
                variant="ghost"
                color="red"
                aria-expanded={showDetail}
                onClick={() => setShowDetail((value) => !value)}
              >
                {showDetail ? "Hide details" : "Details"}
              </Button>
            ) : null}
            <Button size="1" variant="soft" color="red" onClick={onRetry}>
              Retry
            </Button>
          </Flex>
        </Flex>
        {showDetail && failure.detail ? (
          <Text
            as="div"
            size="1"
            color="gray"
            style={{ fontFamily: "var(--code-font-family)", whiteSpace: "pre-wrap" }}
          >
            {failure.detail}
          </Text>
        ) : null}
      </Flex>
    </Callout.Root>
  );
}
