import { agentSubscriptionConfigSchema } from "@workspace/agentic-core/agent-subscription-config";
import { resolveDurableObjectService } from "@vibestudio/service-schemas/clients/durableObjectServiceClient";
import { channelClientRpcMethods } from "@workspace/pubsub/rpc-contract";
import { modelSettingsRpcMethods } from "@workspace/model-catalog/rpc-contract";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import { toCredentialConnectRequest } from "@workspace/model-catalog/providerConnect";
/**
 * Agentic Chat Panel
 *
 * On mount without a channelName, auto-generates a channel and spawns the
 * default agent DO (AiChatWorker). The panel's own contextId is used
 * directly — no cross-context navigation needed.
 */

import {
  isRpcConnectionLost,
  contextId,
  rpc,
  panel,
  buildPanelLink,
  createDurableObjectServiceClient,
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
  useRef,
  useState,
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
import { unsubscribeAgentFromChannel } from "@workspace/agentic-core/agent-launch";
import { createPanelImportLoader } from "@workspace/agentic-core/panel-import-loader";
import type {
  AvailableAgent,
  ModelCatalog,
  AgentSubscriptionConfig,
  ModelSetupResult,
} from "@workspace/agentic-core";
import {
  ProvisionalAgentLifecycle,
  type ProvisionalAgentIntent,
} from "@workspace/agentic-core/provisional-agent-lifecycle";
import {
  DEFAULT_AGENT_MODEL_REF,
  LOCAL_MODELS_EXTENSION_ID,
  LOCAL_PROVIDER_ID,
  MODEL_SETTINGS_SERVICE_PROTOCOL,
  isModelUsable,
  type DefaultAgentConfig,
  type ModelSettingsSnapshot,
} from "@workspace/model-catalog/catalog";
import {
  ownModelSettingsRequest,
  ownModelSettingsConnection,
} from "./modelSettingsRequest.js";
import { isReviewPending } from "@vibestudio/shared/authority/reviewPending";
import type { ServerKind } from "@workspace/model-catalog/localModels";
import { localModelsExtensionMethods } from "@workspace/model-catalog/localModels";
import type { DurableObjectServiceClient } from "@workspace/runtime";
import {
  buildAgentSubscriptionConfig,
  requireChatContextId,
  sanitizeHandle,
} from "./bootstrap.js";
import {
  createAndSubscribeAgent,
  persistInstalledAgent,
  waitForPanelReview,
} from "./agentLifecycle.js";
import { useAgentRecovery } from "./useAgentRecovery.js";
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

/** Default DO worker source and class for the AI chat agent */
const DEFAULT_WORKER_SOURCE = "workers/agent-worker";
const DEFAULT_CLASS_NAME = "AiChatWorker";
const DEFAULT_HANDLE = "ai-chat";
const CHANNEL_SERVICE_PROTOCOL = "vibestudio.channel.v1";

/** Response shape from workers.listSources */

interface ChannelDORef {
  source: string;
  className: string;
  objectKey: string;
}

function parseDoTargetId(participantId: string): ChannelDORef | null {
  if (!participantId.startsWith("do:")) return null;
  const body = participantId.slice(3);
  const slashIdx = body.indexOf("/");
  const colonAfterSlash = slashIdx >= 0 ? body.indexOf(":", slashIdx) : -1;
  if (colonAfterSlash === -1) return null;
  const source = body.slice(0, colonAfterSlash);
  const rest = body.slice(colonAfterSlash + 1);
  const nextColon = rest.indexOf(":");
  if (nextColon === -1) return null;
  return {
    source,
    className: rest.slice(0, nextColon),
    objectKey: rest.slice(nextColon + 1),
  };
}

async function getChannelDOParticipants(
  channelId: string,
  signal: AbortSignal,
): Promise<ChannelDORef[]> {
  const channelService = await resolveDurableObjectService(
    rpc,
    CHANNEL_SERVICE_PROTOCOL,
    channelId,
    { signal },
  );
  if (channelService.kind !== "durable-object" || !channelService.targetId) {
    throw new Error("Channel service must resolve to a Durable Object service");
  }
  const participants = await rpc.call(
    channelService.targetId,
    channelClientRpcMethods["getParticipants"],
    [],
    { signal },
  );
  return participants
    .map((p) => parseDoTargetId(p.participantId))
    .filter((p): p is ChannelDORef => p !== null);
}

/** Persisted per-agent record. `key` is the stable DO `objectKey` minted once
 *  when the user first adds the agent, so rehydration reuses the same entity
 *  row rather than spawning a fresh participant. */
interface InstalledAgent {
  agentId: string;
  handle: string;
  key: string;
  source: string;
  className: string;
  /** Per-agent subscription config (model, effort, etc.), layered over the
   *  global `agentConfig` on rehydration so switched/added agents come back
   *  on their own model. Excludes `handle` (stored separately above). */
  config?: Record<string, unknown>;
}

/** Type for chat panel state args */
interface ChatStateArgs {
  channelName?: string;
  seed?: import("@workspace/pubsub").ConversationSeed;
  channelConfig?: Record<string, unknown>;
  installedAgents?: InstalledAgent[];
  agentSource?: string;
  agentClass?: string;
  /** Envelope to scroll to and highlight once it is in the transcript — set by
   *  notification surfaces and other channels' open links (messaging plan §4.5,
   *  §4.10). Consumed (cleared) once honoured. */
  focusMessageId?: string;
  /** System prompt for the agent harness */
  systemPrompt?: string;
  /** How systemPrompt interacts with Vibestudio base, workspace prompt, and skills */
  systemPromptMode?: "append" | "replace-vibestudio" | "replace";
  /** Extra subscription config for custom/test agents */
  agentConfig?: Record<string, unknown>;
  /** Context-relative TSX file to load into the panel-local action bar */
  actionBarFile?: string | null;
  /** Props for actionBarFile */
  actionBarProps?: Record<string, unknown> | null;
  /** Preferred max height for actionBarFile */
  actionBarMaxHeight?: number | null;
  /** Per-fork read cursors (channelId → last-seen head seq) for live badges. */
  forkCursors?: Record<string, number>;
  /** Product-owned conversation framing. The canonical chat mechanics remain unchanged. */
  presentation?: ConversationPresentation;
  /** Stable participant recipients for unmentioned player messages. */
  defaultRecipients?: string[];
}

/** Unsubscribe a DO from a channel via unified RPC. */
async function unsubscribeDOFromChannel(
  source: string,
  className: string,
  objectKey: string,
  channelId: string,
): Promise<void> {
  await unsubscribeAgentFromChannel(rpc, {
    source,
    className,
    key: objectKey,
    channelId,
  });
}

export default function ChatPanel() {
  const theme = usePanelTheme();
  const appTheme = usePanelThemeConfig();
  const stateArgs = useStateArgs<ChatStateArgs>();
  const resolvedContextId = requireChatContextId(contextId);
  const provisionalAgentLifecycleRef = useRef<ProvisionalAgentLifecycle | null>(
    null,
  );
  const provisionalAgentIntentRevisionRef = useRef(0);
  const modelSettingsServiceRef = useRef<DurableObjectServiceClient<
    typeof modelSettingsRpcMethods
  > | null>(null);
  const modelSettingsSnapshotRef = useRef<ModelSettingsSnapshot | null>(null);
  const modelSettingsRequestRef = useRef<ReturnType<
    typeof ownModelSettingsRequest<ModelSettingsSnapshot>
  > | null>(null);
  const [modelSettingsError, setModelSettingsError] = useState<string | null>(
    null,
  );
  const preparedAgentRuntimeRefs = useRef(new Set<string>());
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog | null>(null);
  const [workspaceDefaultModelRef, setWorkspaceDefaultModelRef] = useState<
    string | null
  >(null);
  const [workspaceDefaultAgentConfig, setWorkspaceDefaultAgentConfig] =
    useState<DefaultAgentConfig | null>(null);
  const catalogRef = useRef<ModelCatalog | null>(null);
  // The first agent cannot launch until model discovery establishes either a
  // configured usable default or the need for an explicit first-run choice.
  const [firstAgentModelPreflight, setFirstAgentModelPreflight] = useState<
    "checking" | "ready" | "selection-required"
  >("checking");

  const getProvisionalAgentLifecycle = useCallback(() => {
    provisionalAgentLifecycleRef.current ??= new ProvisionalAgentLifecycle(
      rpc,
      undefined,
      waitForPanelReview,
    );
    return provisionalAgentLifecycleRef.current;
  }, []);

  useEffect(
    () => () => {
      provisionalAgentIntentRevisionRef.current += 1;
      const lifecycle = provisionalAgentLifecycleRef.current;
      provisionalAgentLifecycleRef.current = null;
      void lifecycle?.dispose().catch((error) => {
        console.warn("[ChatPanel] Failed to dispose provisional agent:", error);
      });
    },
    [],
  );

  const getModelSettingsService = useCallback(() => {
    modelSettingsServiceRef.current ??= createDurableObjectServiceClient(
      MODEL_SETTINGS_SERVICE_PROTOCOL,
      modelSettingsRpcMethods,
    );
    return modelSettingsServiceRef.current;
  }, []);

  const applyModelSettings = useCallback((settings: ModelSettingsSnapshot) => {
    modelSettingsSnapshotRef.current = settings;
    catalogRef.current = settings.catalog;
    setModelCatalog(settings.catalog);
    setWorkspaceDefaultModelRef(settings.defaultModel);
    setWorkspaceDefaultAgentConfig(settings.defaultAgentConfig);
    const defaultEntry = settings.catalog.models.find(
      (model) => model.ref === settings.defaultModel,
    );
    const defaultIsUsable = isModelUsable(defaultEntry);
    // An unusable fallback needs setup. An installed local fallback is still an
    // explicit first-use choice because it is materially different from a
    // configured cloud provider. The inline first-agent preflight owns both.
    setFirstAgentModelPreflight(
      !defaultIsUsable ||
        (settings.defaultModelSource === "fallback" &&
          defaultEntry?.provider === LOCAL_PROVIDER_ID)
        ? "selection-required"
        : "ready",
    );
    console.info("[ChatPanel] model settings ready", {
      defaultModel: settings.defaultModel,
      defaultModelSource: settings.defaultModelSource,
      defaultAvailability: defaultEntry?.availability.state ?? "missing",
    });
  }, []);

  const loadModelSettings = useCallback(
    async (refresh = false): Promise<ModelSettingsSnapshot> => {
      if (modelSettingsRequestRef.current)
        return modelSettingsRequestRef.current.promise;
      if (!refresh && modelSettingsSnapshotRef.current)
        return modelSettingsSnapshotRef.current;
      modelSettingsSnapshotRef.current = null;
      setFirstAgentModelPreflight("checking");
      setModelSettingsError(null);
      const request = ownModelSettingsRequest(async (signal) => {
        const settings = await getModelSettingsService().callWithOptions(
          "getSettings",
          [],
          { signal },
        );
        signal.throwIfAborted();
        applyModelSettings(settings);
        return settings;
      });
      modelSettingsRequestRef.current = request;
      // Every caller shares the exact existing flight, including its original failure.
      request.promise = request.promise.finally(() => {
        if (modelSettingsRequestRef.current === request)
          modelSettingsRequestRef.current = null;
      });
      return request.promise;
    },
    [applyModelSettings, getModelSettingsService],
  );

  const resolveWorkspaceDefaultAgentConfig =
    useCallback(async (): Promise<DefaultAgentConfig> => {
      return (await loadModelSettings(true)).defaultAgentConfig;
    }, [loadModelSettings]);

  useEffect(() => {
    const close = ownModelSettingsConnection(rpc, {
      current: () => modelSettingsRequestRef.current,
      invalidate: () => {
        modelSettingsSnapshotRef.current = null;
        setFirstAgentModelPreflight("checking");
      },
      reconnect: () => setModelSettingsRetrySignal((value) => value + 1),
      failure: (error) =>
        setModelSettingsError(
          error instanceof Error ? error.message : String(error),
        ),
    });
    return () => {
      void close().catch((error) =>
        console.error("[ChatPanel] Model discovery closure failed:", error),
      );
    };
  }, []);

  // Auto-bootstrap: when no channelName, mint one. The chat surface may then
  // activate an uncommitted first-agent lease while the user composes; only the
  // first send subscribes and persists it.
  const [bootstrapChannel, setBootstrapChannel] = useState<string | null>(null);
  const [connectionRetrySignal, setConnectionRetrySignal] = useState(0);
  const [modelSettingsRetrySignal, setModelSettingsRetrySignal] = useState(0);
  const [bootstrapPersistenceRetrySignal, setBootstrapPersistenceRetrySignal] =
    useState(0);
  const approvalChangeNeedsConnectionRetryRef = useRef(false);
  const modelSettingsRecoveryRef = useRef(false);
  const workspaceEvents = useMemo(() => new EventsClient(rpc), []);
  const bootstrapChannelRef = useRef<string | null>(null);

  useEffect(() => {
    const off = workspaceEvents.on(SHELL_APPROVAL_PENDING_CHANGED_EVENT, () => {
      // A review transition can unblock the model-settings service as well as
      // the chat channel. Refresh that source of truth first; the chat
      // connection is retried only after the catalog is usable again.
      approvalChangeNeedsConnectionRetryRef.current = true;
      setModelSettingsRetrySignal((signal) => signal + 1);
      setBootstrapPersistenceRetrySignal((signal) => signal + 1);
    });
    void workspaceEvents.subscribe(SHELL_APPROVAL_PENDING_CHANGED_EVENT);
    return () => {
      off();
      void workspaceEvents.unsubscribe(SHELL_APPROVAL_PENDING_CHANGED_EVENT);
    };
  }, [workspaceEvents]);

  useEffect(() => {
    const event = "workspace:config-changed";
    const off = workspaceEvents.on(event, () => {
      setModelSettingsRetrySignal((signal) => signal + 1);
    });
    void workspaceEvents.subscribe(event);
    return () => {
      off();
      void workspaceEvents.unsubscribe(event);
    };
  }, [workspaceEvents]);

  useEffect(() => {
    if (stateArgs.channelName || !resolvedContextId) return;
    let disposed = false;
    let retryTimer: number | null = null;

    // Allocate once, then keep persisting that exact identity until the
    // creation review releases workspace-state. Generating a new channel on
    // every retry would split the live subscription from the durable panel
    // state; dropping the rejected promise would leave it provisional forever.
    const channelName =
      (bootstrapChannelRef.current ??= `chat-${crypto.randomUUID().slice(0, 8)}`);
    setBootstrapChannel(channelName);
    void panel.stateArgs.patch({ channelName }).catch((error) => {
      if (disposed) return;
      if (isReviewPending(error)) {
        // The approval event is the fast path. This quiet retry covers a panel
        // that mounted after the event or briefly lost its event subscription.
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          if (!disposed)
            setBootstrapPersistenceRetrySignal((signal) => signal + 1);
        }, 5_000);
        return;
      }
      console.warn(
        "[ChatPanel] Failed to persist the bootstrap channel:",
        error instanceof Error ? error.message : String(error),
      );
    });

    return () => {
      disposed = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [
    resolvedContextId,
    stateArgs.channelName,
    bootstrapPersistenceRetrySignal,
  ]);

  // Resolve this before constructing action callbacks that include the
  // channel in durable notification ids.
  const channelName = stateArgs.channelName ?? bootstrapChannel;
  const creationChannelConfig = useMemo(
    () => ({ ...stateArgs.channelConfig, seed: stateArgs.seed }),
    [stateArgs.channelConfig, stateArgs.seed],
  );

  // Reconcile persisted agent membership. The effect owns cancellation; an
  // updated channel/config starts a fresh recovery rather than inheriting a
  // cancelled attempt's "already checked" latch.
  const recoverInstalledAgents = useCallback(
    async (signal: AbortSignal) => {
      const channelName = stateArgs.channelName!;
      const dos = await getChannelDOParticipants(channelName, signal);
      signal.throwIfAborted();
      const missingAgents = (stateArgs.installedAgents ?? []).filter(
        (agent) =>
          !dos.some(
            (participant) =>
              participant.source === agent.source &&
              participant.className === agent.className &&
              participant.objectKey === agent.key,
          ),
      );
      if (missingAgents.length === 0) return;
      const defaultAgentConfig = await resolveWorkspaceDefaultAgentConfig();
      signal.throwIfAborted();
      for (const agent of missingAgents) {
        const { subscribeConfig } = buildAgentSubscriptionConfig({
          handle: agent.handle,
          workspaceDefaultAgentConfig: defaultAgentConfig,
          globalConfig: stateArgs.agentConfig,
          perAgentConfig: agent.config,
          systemPrompt: stateArgs.systemPrompt,
          systemPromptMode: stateArgs.systemPromptMode,
        });
        await createAndSubscribeAgent({
          source: agent.source,
          className: agent.className,
          key: agent.key,
          channelId: channelName,
          channelContextId: resolvedContextId,
          config: subscribeConfig,
          replay: true,
        });
        signal.throwIfAborted();
      }
    },
    [
      stateArgs.channelName,
      stateArgs.installedAgents,
      stateArgs.agentConfig,
      stateArgs.systemPrompt,
      stateArgs.systemPromptMode,
      resolvedContextId,
      resolveWorkspaceDefaultAgentConfig,
    ],
  );
  const reportRecoveryFailure = useCallback((error: Error) => {
    console.warn("[ChatPanel] Agent subscription recovery failed:", error);
    void notifications.show({
      type: "error",
      title: "Couldn't reconnect the chat agent",
      message: error.message,
    });
  }, []);
  const {
    status: rehydrationStatus,
    error: rehydrationError,
    retry: retryAgentRecovery,
  } = useAgentRecovery(
    stateArgs.channelName && (stateArgs.installedAgents?.length ?? 0) > 0
      ? recoverInstalledAgents
      : null,
    reportRecoveryFailure,
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

  const effectiveDefaultAgentConfig = useMemo<DefaultAgentConfig | null>(() => {
    const globalConfig = stateArgs.agentConfig ?? {};
    const model =
      typeof globalConfig["model"] === "string"
        ? globalConfig["model"]
        : undefined;
    const thinkingLevel =
      typeof globalConfig["thinkingLevel"] === "string"
        ? (globalConfig["thinkingLevel"] as DefaultAgentConfig["thinkingLevel"])
        : undefined;
    const fastMode =
      typeof globalConfig["fastMode"] === "boolean"
        ? globalConfig["fastMode"]
        : undefined;
    const approvalLevel =
      globalConfig["approvalLevel"] === 0 ||
      globalConfig["approvalLevel"] === 1 ||
      globalConfig["approvalLevel"] === 2
        ? globalConfig["approvalLevel"]
        : undefined;
    if (
      !model &&
      !thinkingLevel &&
      fastMode === undefined &&
      approvalLevel === undefined
    ) {
      return workspaceDefaultAgentConfig;
    }
    return {
      ...(workspaceDefaultAgentConfig ?? {}),
      model:
        model ?? workspaceDefaultAgentConfig?.model ?? DEFAULT_AGENT_MODEL_REF,
      ...(thinkingLevel ? { thinkingLevel } : {}),
      ...(fastMode !== undefined ? { fastMode } : {}),
      ...(approvalLevel !== undefined ? { approvalLevel } : {}),
    };
  }, [stateArgs.agentConfig, workspaceDefaultAgentConfig]);

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

  const prepareInitialAgentRuntime = useCallback(
    async (agents: AvailableAgent[]) => {
      if (agents.length === 0) return;
      const preferredSource = panel.stateArgs.get<ChatStateArgs>().agentSource;
      const source =
        agents.find((agent) => agent.id === preferredSource)?.id ??
        agents.find((agent) => agent.id === DEFAULT_WORKER_SOURCE)?.id ??
        agents[0]!.id;
      const ref = `ctx:${resolvedContextId}`;
      const preparationKey = `${ref}\0${source}`;
      if (preparedAgentRuntimeRefs.current.has(preparationKey)) return;
      preparedAgentRuntimeRefs.current.add(preparationKey);

      // The panel owns the product choice; the host only prepares immutable
      // bytes at speculative priority. No entity is created and no credential
      // is inspected until the ordinary launch path commits this intent.
      try {
        const report = await rpc.call(
          "main",
          mainRpcMethods["build.getBuildReport"],
          [source, ref, { priority: "speculative" }],
        );
        if (report.status === "ok") return;
        preparedAgentRuntimeRefs.current.delete(preparationKey);
        console.warn("[ChatPanel] Initial agent runtime preparation failed", {
          source,
          status: report.status,
        });
      } catch (error) {
        preparedAgentRuntimeRefs.current.delete(preparationKey);
        throw error;
      }
    },
    [resolvedContextId],
  );

  // Fetch available worker sources (DO agents) on mount. Only sources that
  // declare an `agent` manifest block are chat agents — this filters out
  // service DOs (pubsub-channel, semantic control plane, fork, …).
  const [availableAgents, setAvailableAgents] = useState<AvailableAgent[]>([]);
  useEffect(() => {
    let disposed = false;
    let retryTimer: number | null = null;
    let retryAttempt = 0;

    const retry = () => {
      if (disposed) return;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      const delayMs = Math.min(30_000, 2_000 * 2 ** Math.min(retryAttempt, 4));
      retryAttempt += 1;
      retryTimer = window.setTimeout(loadAvailableAgents, delayMs);
    };

    function loadAvailableAgents() {
      void rpc
        .call("main", mainRpcMethods["workers.listSources"], [])
        .then((sources) => {
          if (disposed) return;
          const agents: AvailableAgent[] = [];
          for (const source of sources) {
            if (!source.agent) continue;
            for (const cls of source.classes) {
              agents.push({
                id: source.source,
                className: cls.className,
                name: source.agent.displayName ?? source.title ?? source.name,
                description: source.agent.description,
                icon: source.icon,
                defaultConfig:
                  source.agent.defaultConfig === undefined
                    ? undefined
                    : agentSubscriptionConfigSchema.parse(
                        source.agent.defaultConfig,
                      ),
                proposedHandle: source.name.split("-")[0] ?? source.name,
              });
            }
          }
          setAvailableAgents(agents);

          // Workspace units are admitted and built asynchronously during a
          // cold bootstrap. An empty successful catalog is therefore a
          // provisional snapshot, not a terminal result. Keep observing it
          // until at least one launchable agent becomes available so queued
          // opening prompts can drain without reloading the panel.
          if (agents.length === 0) {
            retry();
          } else {
            retryAttempt = 0;
            console.info("[ChatPanel] agent source catalog ready", {
              sourceCount: sources.length,
              agentCount: agents.length,
            });
          }
        })
        .catch((err) => {
          if (disposed) return;
          if (!isReviewPending(err)) {
            console.warn(
              "[ChatPanel] Failed to load worker sources; retrying:",
              err,
            );
          }
          retry();
        });
    }

    loadAvailableAgents();
    return () => {
      disposed = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [connectionRetrySignal]);

  // Speculation begins only after model discovery has crossed its user-visible
  // readiness boundary. This effect runs after React commits the chooser, so a
  // cold agent dependency install can never delay the setup decision it is
  // intended to accelerate.
  useEffect(() => {
    if (firstAgentModelPreflight === "checking") return;
    void prepareInitialAgentRuntime(availableAgents).catch((error) => {
      if (!isRpcConnectionLost(error)) {
        console.warn(
          "[ChatPanel] Initial agent runtime preparation failed:",
          error instanceof Error ? error.message : String(error),
        );
      }
    });
  }, [availableAgents, firstAgentModelPreflight, prepareInitialAgentRuntime]);

  useEffect(
    () =>
      recoveryCoordinator.registerResubscribeHandler(
        `chat-initial-agent-runtime:${panel.slotId}`,
        () => prepareInitialAgentRuntime(availableAgents),
        { includeCurrentGeneration: false },
      ),
    [availableAgents, prepareInitialAgentRuntime],
  );

  // Availability (connected/startable/needs-setup) now arrives on every
  // catalog entry from the model-settings worker — one shared source for all
  // consumers (design §7.1). The old panel-scoped credential heuristic and
  // its deliberate scoping boundary are gone with it.
  useEffect(() => {
    let disposed = false;
    void loadModelSettings(modelSettingsRetrySignal > 0)
      .then(() => {
        if (
          disposed ||
          (!modelSettingsRecoveryRef.current &&
            !approvalChangeNeedsConnectionRetryRef.current)
        )
          return;
        modelSettingsRecoveryRef.current = false;
        approvalChangeNeedsConnectionRetryRef.current = false;
        setConnectionRetrySignal((value) => value + 1);
      })
      .catch((error: unknown) => {
        if (disposed) return;
        modelSettingsRecoveryRef.current = true;
        setModelSettingsError(
          error instanceof Error ? error.message : String(error),
        );
      });
    return () => {
      disposed = true;
    };
  }, [loadModelSettings, modelSettingsRetrySignal]);

  useEffect(() => {
    let disposed = false;
    let refreshTimer: number | null = null;

    const clearRefreshTimer = () => {
      if (refreshTimer === null) return;
      window.clearTimeout(refreshTimer);
      refreshTimer = null;
    };
    const scheduleRefresh = () => {
      if (disposed || refreshTimer !== null) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        if (disposed) return;
        void loadModelSettings(true).catch((err) => {
          console.warn(
            "[ChatPanel] Failed to refresh model settings after local model event:",
            err,
          );
        });
      }, 500);
    };

    const subscriptions = [
      extensions.on(
        LOCAL_MODELS_EXTENSION_ID,
        "models.changed",
        scheduleRefresh,
      ),
      extensions.on(LOCAL_MODELS_EXTENSION_ID, "server.state", scheduleRefresh),
      extensions.on(
        LOCAL_MODELS_EXTENSION_ID,
        "download.progress",
        scheduleRefresh,
      ),
    ];

    return () => {
      disposed = true;
      clearRefreshTimer();
      for (const subscription of subscriptions) subscription.dispose();
    };
  }, [loadModelSettings]);

  /** Build the subscription config for a new agent: workspace defaults, global
   *  agentConfig, then the per-agent config, with the resolved handle last.
   *  Returns both the wire config and the per-agent config to persist. */
  const buildSubscribeConfig = useCallback(
    (
      handle: string,
      config: AgentSubscriptionConfig | undefined,
      defaultAgentConfig: DefaultAgentConfig,
    ) => {
      // Launch configuration must be one coherent read. Reactive state is for
      // rendering, while this callback can outlive the render that created it
      // as model discovery and provisional activation race with bootstrap.
      const currentState = panel.stateArgs.get<ChatStateArgs>();
      return buildAgentSubscriptionConfig({
        handle,
        workspaceDefaultAgentConfig: defaultAgentConfig,
        globalConfig: currentState.agentConfig,
        perAgentConfig: config,
        systemPrompt: currentState.systemPrompt,
        systemPromptMode: currentState.systemPromptMode,
      });
    },
    [],
  );

  const resolveProvisionalAgentIntent = useCallback(
    async (
      channelId: string,
      channelContextId: string | undefined,
      agentId: string | undefined,
      config: AgentSubscriptionConfig | undefined,
    ): Promise<ProvisionalAgentIntent> => {
      const activeContextId = requireChatContextId(contextId, channelContextId);
      const matched = agentId
        ? availableAgents.find(
            (agent) => agent.id === agentId || agent.className === agentId,
          )
        : undefined;
      const pinned = panel.stateArgs.get<ChatStateArgs>();
      const source =
        matched?.id ??
        (!agentId ? pinned.agentSource : undefined) ??
        DEFAULT_WORKER_SOURCE;
      const className =
        matched?.className ??
        (!agentId ? pinned.agentClass : undefined) ??
        DEFAULT_CLASS_NAME;
      const handleFromClass =
        className === DEFAULT_CLASS_NAME
          ? DEFAULT_HANDLE
          : className.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
      const configHandle =
        typeof config?.["handle"] === "string"
          ? (config["handle"] as string)
          : "";
      const requestedHandle =
        configHandle.trim() ||
        matched?.proposedHandle ||
        handleFromClass ||
        DEFAULT_HANDLE;
      const handleBase = sanitizeHandle(requestedHandle);
      const defaultAgentConfig = await resolveWorkspaceDefaultAgentConfig();
      const { subscribeConfig, perAgent } = buildSubscribeConfig(
        handleBase,
        config,
        defaultAgentConfig,
      );
      return {
        source,
        className,
        channelId,
        channelContextId: activeContextId,
        handleBase,
        config: subscribeConfig,
        persistedConfig: perAgent,
        replay: true,
      };
    },
    [availableAgents, buildSubscribeConfig, resolveWorkspaceDefaultAgentConfig],
  );

  // Explicitly replace workspace defaults (model + behavior). The first
  // successful answer initializes an absent model preference on the host.
  const saveDefaultAgentConfig = useCallback(
    async (config: DefaultAgentConfig): Promise<void> => {
      const settings = await getModelSettingsService().call(
        "setDefaultAgentConfig",
        config,
      );
      applyModelSettings(settings);
    },
    [applyModelSettings, getModelSettingsService],
  );

  const handlePrepareAgent = useCallback(
    async (
      channelName: string,
      channelContextId: string | undefined,
      agentId: string | undefined,
      config: AgentSubscriptionConfig | null,
    ): Promise<void> => {
      const revision = ++provisionalAgentIntentRevisionRef.current;
      if (config === null) {
        await provisionalAgentLifecycleRef.current?.prepare(null);
        return;
      }
      if (
        (panel.stateArgs.get<ChatStateArgs>().installedAgents?.length ?? 0) > 0
      ) {
        await provisionalAgentLifecycleRef.current?.prepare(null);
        return;
      }
      const intent = await resolveProvisionalAgentIntent(
        channelName,
        channelContextId,
        agentId,
        config,
      );
      if (revision !== provisionalAgentIntentRevisionRef.current) return;
      await getProvisionalAgentLifecycle().prepare(intent);
    },
    [getProvisionalAgentLifecycle, resolveProvisionalAgentIntent],
  );

  const handleAddAgent = useCallback(
    async (
      channelName: string,
      channelContextId?: string,
      agentId?: string,
      config?: AgentSubscriptionConfig,
    ) => {
      const intent = await resolveProvisionalAgentIntent(
        channelName,
        channelContextId,
        agentId,
        config,
      );
      const lifecycle = getProvisionalAgentLifecycle();
      const isFirstPersistedAgent =
        (panel.stateArgs.get<ChatStateArgs>().installedAgents?.length ?? 0) ===
        0;
      let source = intent.source;
      let className = intent.className;
      let handle: string;
      let agentKey: string;
      let perAgent = intent.persistedConfig;

      if (isFirstPersistedAgent && !lifecycle.hasCommitted) {
        const claimed = await lifecycle.claim(intent);
        source = claimed.source;
        className = claimed.className;
        handle = claimed.handle;
        agentKey = claimed.key;
        perAgent = claimed.persistedConfig;
      } else {
        handle = `${intent.handleBase}-${crypto.randomUUID().slice(0, 4)}`;
        agentKey = `${handle}-${crypto.randomUUID().slice(0, 8)}`;
        await createAndSubscribeAgent({
          source,
          className,
          key: agentKey,
          channelId: channelName,
          channelContextId: intent.channelContextId,
          config: { ...intent.config, handle },
          replay: intent.replay,
        });
      }
      // The workspace default model is written ONLY via the explicit "Save as
      // default" control (onSaveDefaultModel) — never as a side-effect of adding an
      // agent, so a deferred/auto spawn (e.g. onboarding) can't silently change it.
      // Persist into stateArgs.installedAgents so the agent rehydrates on reload.
      // Read the latest snapshot (rather than the captured `stateArgs`) to avoid
      // clobbering concurrent additions.
      await persistInstalledAgent({
        agentId: className,
        handle,
        key: agentKey,
        source,
        className,
        ...(Object.keys(perAgent).length > 0 ? { config: perAgent } : {}),
      });
      return { agentId: source, handle };
    },
    [getProvisionalAgentLifecycle, resolveProvisionalAgentIntent],
  );

  const handleReplaceAgent = useCallback(
    async (
      channelName: string,
      participantId: string,
      agentId?: string,
      config?: AgentSubscriptionConfig,
    ) => {
      const activeContextId = requireChatContextId(contextId);
      const target = parseDoTargetId(participantId);
      if (!target) {
        throw new Error(`Cannot resolve agent participant: ${participantId}`);
      }
      // Resolve the new agent type. When agentId is omitted (restart-with-model),
      // reuse the existing DO's source/className.
      const agent = agentId
        ? availableAgents.find(
            (a) => a.id === agentId || a.className === agentId,
          )
        : undefined;
      const source = agent?.id ?? target.source;
      const className = agent?.className ?? target.className;
      // Reuse the existing handle for a stable identity across the switch.
      const configHandle =
        typeof config?.["handle"] === "string"
          ? (config["handle"] as string)
          : "";
      const handle =
        configHandle.trim() || agent?.proposedHandle || DEFAULT_HANDLE;
      const agentKey = `${handle}-${crypto.randomUUID().slice(0, 8)}`;
      const defaultAgentConfig = await resolveWorkspaceDefaultAgentConfig();
      const { subscribeConfig, perAgent } = buildSubscribeConfig(
        handle,
        config,
        defaultAgentConfig,
      );

      // Kick the exact DO, then invite the replacement (replay restores history).
      await unsubscribeDOFromChannel(
        target.source,
        target.className,
        target.objectKey,
        channelName,
      );
      await createAndSubscribeAgent({
        source,
        className,
        key: agentKey,
        channelId: channelName,
        channelContextId: activeContextId,
        config: subscribeConfig,
        replay: true,
      });
      // Workspace default is written only via the explicit "Save as default"
      // control — switching an agent never changes it.
      // Rewrite the matching persisted record (matched by old objectKey) so reload
      // rehydrates the new model rather than the old one.
      const currentArgs = panel.stateArgs.get<ChatStateArgs>();
      const newRecord = {
        agentId: className,
        handle,
        key: agentKey,
        source,
        className,
        ...(Object.keys(perAgent).length > 0 ? { config: perAgent } : {}),
      };
      const existing = currentArgs.installedAgents ?? [];
      const replaced = existing.some((a) => a.key === target.objectKey);
      const nextInstalled = replaced
        ? existing.map((a) => (a.key === target.objectKey ? newRecord : a))
        : [...existing, newRecord];
      await panel.stateArgs.patch({ installedAgents: nextInstalled });
      return { agentId: source, handle };
    },
    [availableAgents, buildSubscribeConfig, resolveWorkspaceDefaultAgentConfig],
  );

  const handleConnectModelProvider = useCallback(
    async (
      modelRef: string,
      method: string,
      browser: "internal" | "external",
      signal: AbortSignal,
      configuration?: Record<string, string>,
    ) => {
      const model = catalogRef.current?.models.find(
        (entry) => entry.ref === modelRef,
      );
      if (!model || !model.connectable)
        throw new Error(
          "This model requires provider configuration before connecting.",
        );
      const request = toCredentialConnectRequest(model.provider, {
        method,
        browser,
        configuration,
      });
      if (!request)
        throw new Error(
          "This sign-in method is unavailable. Choose another method.",
        );
      await rpc.call("main", mainRpcMethods["credentials.connect"], [request], {
        signal,
      });
      await loadModelSettings(true);
    },
    [loadModelSettings],
  );

  const handleInstallLocalModel = useCallback(
    async (modelRef: string): Promise<ModelSetupResult> => {
      try {
        await extensions.invoke(LOCAL_MODELS_EXTENSION_ID, "installModel", [
          modelRef,
        ]);
        await loadModelSettings(true);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    [loadModelSettings],
  );

  const handlePersistAgentModel = useCallback(
    async (
      _channelName: string,
      participantId: string,
      model: string,
    ): Promise<void> => {
      const target = parseDoTargetId(participantId);
      if (!target) {
        throw new Error(`Cannot resolve agent participant: ${participantId}`);
      }
      const currentArgs = panel.stateArgs.get<ChatStateArgs>();
      const existing = currentArgs.installedAgents ?? [];
      const nextInstalled = existing.map((agent) => {
        if (agent.key !== target.objectKey) return agent;
        return {
          ...agent,
          config: {
            ...(agent.config ?? {}),
            model,
          },
        };
      });
      if (!existing.some((agent) => agent.key === target.objectKey)) {
        throw new Error(`No persisted agent record found for ${participantId}`);
      }
      await panel.stateArgs.patch({ installedAgents: nextInstalled });
      // Per-agent model only — the workspace default is changed solely via the
      // explicit "Save as default" control.
    },
    [],
  );

  const handleRemoveAgent = useCallback(
    async (channelName: string, handle: string) => {
      try {
        const currentArgs = panel.stateArgs.get<ChatStateArgs>();
        const persisted = (currentArgs.installedAgents ?? []).find(
          (agent) => agent.handle === handle,
        );
        if (!persisted)
          throw new Error(`No installed agent record matches @${handle}`);
        await unsubscribeDOFromChannel(
          persisted.source,
          persisted.className,
          persisted.key,
          channelName,
        );
        await panel.stateArgs.patch({
          installedAgents: (currentArgs.installedAgents ?? []).filter(
            (agent) => agent.key !== persisted.key,
          ),
        });
      } catch (err) {
        void notifications.show({
          type: "error",
          title: `Couldn't remove @${handle}`,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    [],
  );

  const chatActions: AgenticChatActions = useMemo(
    () => ({
      onListTaskRules: () => {
        if (!resolvedContextId || !channelName)
          throw new Error("Conversation has no runtime context");
        return rpc.call("main", mainRpcMethods["authority.listTaskRules"], [
          { contextId: resolvedContextId, channelId: channelName },
        ]);
      },
      onResetTaskRules: async () => {
        if (!resolvedContextId || !channelName)
          throw new Error("Conversation has no runtime context");
        const result = await rpc.call(
          "main",
          mainRpcMethods["authority.resetTaskRules"],
          [{ contextId: resolvedContextId, channelId: channelName }],
        );
        return result.revokedGrantCount;
      },
      onNewConversation: handleNewConversation,
      onAddAgent: handleAddAgent,
      onPrepareAgent: handlePrepareAgent,
      onReplaceAgent: handleReplaceAgent,
      onInstallLocalModel: handleInstallLocalModel,
      onConnectModelProvider: handleConnectModelProvider,
      onPersistAgentModel: handlePersistAgentModel,
      onSaveDefaults: saveDefaultAgentConfig,
      onRemoveAgent: handleRemoveAgent,
      availableAgents,
      modelCatalog,
      defaultModelRef: workspaceDefaultModelRef,
      defaultAgentConfig: effectiveDefaultAgentConfig,
      firstAgentModelPreflight,

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
      handleNewConversation,
      handleAddAgent,
      handlePrepareAgent,
      handleReplaceAgent,
      handleInstallLocalModel,
      handleConnectModelProvider,
      handlePersistAgentModel,
      saveDefaultAgentConfig,
      handleRemoveAgent,
      availableAgents,
      modelCatalog,
      workspaceDefaultModelRef,
      effectiveDefaultAgentConfig,
      firstAgentModelPreflight,
      bootstrapChannel,
      handleFocusPanel,
      handleReloadPanel,
      handleOpenChannel,
      handleOpenLocalModelsLog,
      handleOpenLocalModels,
      channelName,
      resolvedContextId,
    ],
  );

  // In-place fork switch: explicitly move the panel runtime to the fork's
  // already-created workspace branch. State args carry only the channel.
  const handleForkSwitch = useCallback(
    async (forkChannelId: string, forkContextId: string) => {
      console.info("[ChatPanel] switching to fork", {
        fromChannelId: stateArgs.channelName ?? bootstrapChannel ?? null,
        fromContextId: resolvedContextId,
        forkChannelId,
        forkContextId,
      });
      const current = panel.stateArgs.get<
        ChatStateArgs & { contextId?: unknown }
      >();
      const { contextId: _obsoleteContextId, ...panelState } = current;
      await panel.switchContext(forkContextId, {
        stateArgs: { ...panelState, channelName: forkChannelId },
      });
    },
    [bootstrapChannel, resolvedContextId, stateArgs.channelName],
  );

  // Side-by-side: open the fork in a fresh chat panel (news-panel shape).
  const handleOpenForkPanel = useCallback(
    async (forkChannelId: string, forkContextId: string) => {
      console.info("[ChatPanel] opening fork panel", {
        fromChannelId: stateArgs.channelName ?? bootstrapChannel ?? null,
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
    [bootstrapChannel, resolvedContextId, stateArgs.channelName],
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

  const readForkCursors = useCallback(
    () => panel.stateArgs.get<ChatStateArgs>().forkCursors ?? {},
    [],
  );

  const forkCursorWriteRef = useRef<Promise<void>>(Promise.resolve());
  const markForkRead = useCallback(
    async (forkChannelId: string, headSeq: number) => {
      const write = forkCursorWriteRef.current.then(async () => {
        const current = panel.stateArgs.get<ChatStateArgs>();
        const prior = current.forkCursors?.[forkChannelId] ?? 0;
        if (prior >= headSeq) return;
        await panel.stateArgs.patch({
          forkCursors: {
            ...(current.forkCursors ?? {}),
            [forkChannelId]: headSeq,
          },
        });
      });
      // Keep the queue usable after a failed write while returning the original
      // rejection to the caller so the UI can surface it.
      forkCursorWriteRef.current = write.then(
        () => undefined,
        () => undefined,
      );
      await write;
    },
    [],
  );

  const forkNav: ForkNavHandlers = useMemo(
    () => ({
      switchTo: handleForkSwitch,
      openInNewPanel: handleOpenForkPanel,
      readForkCursors,
      markForkRead,
      onExternalFork: handleExternalFork,
    }),
    [
      handleForkSwitch,
      handleOpenForkPanel,
      readForkCursors,
      markForkRead,
      handleExternalFork,
    ],
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
      {modelSettingsError ? (
        <Theme appearance={theme} {...appTheme}>
          <Callout.Root color="red" size="1" style={{ borderRadius: 0 }}>
            <Flex align="center" justify="between" gap="3" width="100%">
              <Callout.Text>
                Couldn't load models: {modelSettingsError}
              </Callout.Text>
              <Button
                size="1"
                variant="soft"
                color="red"
                onClick={() =>
                  setModelSettingsRetrySignal((value) => value + 1)
                }
              >
                Retry
              </Button>
            </Flex>
          </Callout.Root>
        </Theme>
      ) : null}
      {rehydrationStatus !== "idle" ? (
        <Theme appearance={theme} {...appTheme}>
          <Callout.Root
            color={rehydrationStatus === "failed" ? "red" : "blue"}
            size="1"
            style={{ borderRadius: 0 }}
          >
            <Flex align="center" justify="between" gap="3" width="100%">
              <Callout.Text>
                {rehydrationStatus === "failed"
                  ? `Couldn't reconnect your agent${rehydrationError ? `: ${rehydrationError}` : "."}`
                  : "Reconnecting your agent…"}
              </Callout.Text>
              {rehydrationStatus === "failed" ? (
                <Button
                  size="1"
                  variant="soft"
                  color="red"
                  onClick={retryAgentRecovery}
                >
                  Retry
                </Button>
              ) : null}
            </Flex>
          </Callout.Root>
        </Theme>
      ) : null}
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
            connectionRetrySignal={connectionRetrySignal}
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
              rehydrationStatus !== "idle"
            }
          />
        </Suspense>
      </div>
    </div>
  );
}
