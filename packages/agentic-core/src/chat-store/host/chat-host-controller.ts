/**
 * ChatHostController — the host side of a chat surface.
 *
 * A chat surface (the chat panel, the terminal chat) needs more than a
 * channel connection: a channel to talk in, agents in it, a model to run them,
 * and recovery when a persisted agent is missing. This controller owns that
 * policy, framework-free, over injected ports (see `ports.ts`):
 *
 *   - channel bootstrap: mint `chat-<id>` once and persist it;
 *   - model settings discovery (one owned flight) and first-agent preflight;
 *   - agent catalog discovery (workers declaring an `agent` manifest block);
 *   - the provisional first agent (warm before the first send, claim on send);
 *   - add / replace / remove / persist-model of installed agents;
 *   - installed-agent recovery with status, error and explicit retry;
 *   - default agent config, provider connect, local model install;
 *   - fork read cursors.
 *
 * Every input runs one pipeline step (`StateCell.transaction`): reduce the
 * input, derive dependent fields, start the reactions it implies, notify once.
 * Asynchronous work is owned by AbortController generations; disposal aborts
 * and releases all of it.
 */
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import { isReviewPending } from "@vibestudio/shared/authority/reviewPending";
import { isRpcConnectionLost } from "@vibestudio/rpc";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import {
  createDurableObjectServiceClient,
  resolveDurableObjectService,
} from "@vibestudio/service-schemas/clients/durableObjectServiceClient";
import type { DurableObjectServiceClient } from "@vibestudio/shared/workspaceServiceRpc";
import { channelClientRpcMethods } from "@workspace/pubsub/rpc-contract";
import { modelSettingsRpcMethods } from "@workspace/model-catalog/rpc-contract";
import { toCredentialConnectRequest } from "@workspace/model-catalog/providerConnect";
import {
  DEFAULT_AGENT_MODEL_REF,
  LOCAL_PROVIDER_ID,
  MODEL_SETTINGS_SERVICE_PROTOCOL,
  isModelUsable,
  type DefaultAgentConfig,
  type ModelCatalog,
  type ModelSettingsSnapshot,
} from "@workspace/model-catalog/catalog";
import { unsubscribeAgentFromChannel } from "../../agent-launch.js";
import {
  agentSubscriptionConfigSchema,
  type AgentSubscriptionConfig,
} from "../../agent-subscription-config.js";
import {
  ProvisionalAgentLifecycle,
  type ProvisionalAgentIntent,
} from "../../provisional-agent-lifecycle.js";
import type { AgenticChatActions, AvailableAgent, ModelSetupResult } from "../../types.js";
import {
  RetainCount,
  StateCell,
  errorMessage,
  userFacingError,
  type ReadableStore,
  type UserFacingError,
} from "../store.js";
import { createAndSubscribeAgent, persistInstalledAgent } from "./agent-lifecycle.js";
import {
  AgentRecoveryRunner,
  IDLE_RECOVERY,
  type AgentRecoveryProgress,
  type AgentRecoveryState,
} from "./agent-recovery.js";
import {
  buildAgentSubscriptionConfig,
  parseDoTargetId,
  requireChatContextId,
  sanitizeHandle,
  type ChannelDORef,
  type InstalledAgentRecord,
} from "./installed-agents.js";
import { ownModelSettingsConnection, ownModelSettingsRequest } from "./model-settings-request.js";
import type { ChatHostPorts, ChatHostState } from "./ports.js";

/** Default DO worker source and class for the AI chat agent. */
export const DEFAULT_AGENT_WORKER_SOURCE = "workers/agent-worker";
export const DEFAULT_AGENT_CLASS_NAME = "AiChatWorker";
export const DEFAULT_AGENT_HANDLE = "ai-chat";
const CHANNEL_SERVICE_PROTOCOL = "vibestudio.channel.v1";

/**
 * EXISTING PRODUCT BEHAVIOUR: a channel-name persistence blocked by a pending
 * workspace review is re-attempted after this pause. The approval-change event
 * is the fast path; this quiet re-attempt covers a host that started after the
 * event or briefly lost its event subscription.
 */
export const BOOTSTRAP_REVIEW_REPERSIST_MS = 5_000;
/**
 * EXISTING PRODUCT BEHAVIOUR: local-model extension events arrive in bursts
 * (download progress); they are coalesced into one model-settings refresh.
 */
export const LOCAL_MODEL_REFRESH_DEBOUNCE_MS = 500;
export type ChatHostModelPreflight = "checking" | "ready" | "selection-required";

export interface ChatHostSnapshot {
  /** The conversation channel: persisted, or minted and being persisted. Null
   *  only while the host has no workspace context. */
  channelName: string | null;
  /** Agent types that can be added (workers with an `agent` manifest block). */
  availableAgents: AvailableAgent[];
  modelCatalog: ModelCatalog | null;
  /** Workspace default model ref ("provider:modelId"). */
  workspaceDefaultModelRef: string | null;
  workspaceDefaultAgentConfig: DefaultAgentConfig | null;
  /** Workspace defaults with the host's `agentConfig` layered on top. */
  effectiveDefaultAgentConfig: DefaultAgentConfig | null;
  /** Readiness of the first agent's model: discovery pending, ready, or an
   *  explicit choice is required (no usable default). */
  firstAgentModelPreflight: ChatHostModelPreflight;
  /** Last model discovery failure; retry with `retryModelSettings()`. */
  modelSettingsError: UserFacingError | null;
  /**
   * Last agent catalog read failure; it is re-read on the next workspace event
   * (review decided, config or unit set changed, transport reconnect) or with
   * `retryAgentCatalog()`.
   */
  agentCatalogError: UserFacingError | null;
  /** Installed-agent recovery: idle, recovering (with the missing handles), or
   *  failed with a user-facing `error` until the next trigger or Retry. */
  recovery: AgentRecoveryState;
  /**
   * Revision of "the chat connection may be unblocked": it advances when model
   * settings become readable again after a failure or a workspace review
   * change. A chat session retries a stalled connection on each advance.
   */
  connectionRetrySignal: number;
}

/** The agent-related `AgenticChatActions` members this controller implements. */
export type ChatHostAgentActions = Required<
  Pick<
    AgenticChatActions,
    | "onListTaskRules"
    | "onResetTaskRules"
    | "onAddAgent"
    | "onPrepareAgent"
    | "onReplaceAgent"
    | "onRemoveAgent"
    | "onPersistAgentModel"
    | "onInstallLocalModel"
    | "onConnectModelProvider"
    | "onSaveDefaults"
    | "onParticipantsChanged"
  >
>;

/** The data members of `AgenticChatActions`, projected from a snapshot. */
export function chatHostActionData(
  snapshot: ChatHostSnapshot
): Pick<
  AgenticChatActions,
  "availableAgents" | "modelCatalog" | "defaultModelRef" | "defaultAgentConfig" | "firstAgentModelPreflight"
> {
  return {
    availableAgents: snapshot.availableAgents,
    modelCatalog: snapshot.modelCatalog,
    defaultModelRef: snapshot.workspaceDefaultModelRef,
    defaultAgentConfig: snapshot.effectiveDefaultAgentConfig,
    firstAgentModelPreflight: snapshot.firstAgentModelPreflight,
  };
}

/** The user-facing failure of reading model settings. */
function modelSettingsFailure(cause: unknown): UserFacingError {
  return userFacingError(
    "Models are unavailable right now",
    "Chat can't start a new agent until models load. Retry; if it keeps failing, open model settings to check your providers.",
    cause
  );
}

function effectiveDefaultAgentConfig(
  globalConfig: Record<string, unknown>,
  workspaceDefault: DefaultAgentConfig | null
): DefaultAgentConfig | null {
  const model = typeof globalConfig["model"] === "string" ? globalConfig["model"] : undefined;
  const thinkingLevel =
    typeof globalConfig["thinkingLevel"] === "string"
      ? (globalConfig["thinkingLevel"] as DefaultAgentConfig["thinkingLevel"])
      : undefined;
  const fastMode = typeof globalConfig["fastMode"] === "boolean" ? globalConfig["fastMode"] : undefined;
  const approvalLevel =
    globalConfig["approvalLevel"] === 0 ||
    globalConfig["approvalLevel"] === 1 ||
    globalConfig["approvalLevel"] === 2
      ? globalConfig["approvalLevel"]
      : undefined;
  if (!model && !thinkingLevel && fastMode === undefined && approvalLevel === undefined) {
    return workspaceDefault;
  }
  return {
    ...(workspaceDefault ?? {}),
    model: model ?? workspaceDefault?.model ?? DEFAULT_AGENT_MODEL_REF,
    ...(thinkingLevel ? { thinkingLevel } : {}),
    ...(fastMode !== undefined ? { fastMode } : {}),
    ...(approvalLevel !== undefined ? { approvalLevel } : {}),
  };
}

function initialSnapshot(channelName: string | null): ChatHostSnapshot {
  return {
    channelName,
    availableAgents: [],
    modelCatalog: null,
    workspaceDefaultModelRef: null,
    workspaceDefaultAgentConfig: null,
    effectiveDefaultAgentConfig: null,
    firstAgentModelPreflight: "checking",
    modelSettingsError: null,
    agentCatalogError: null,
    recovery: IDLE_RECOVERY,
    connectionRetrySignal: 0,
  };
}

export class ChatHostController implements ReadableStore<ChatHostSnapshot> {
  readonly #ports: ChatHostPorts;
  readonly #cell: StateCell<ChatHostSnapshot>;
  readonly #retain: RetainCount;
  readonly #uuid: () => string;
  #lifetime = new AbortController();
  #teardown: Array<() => void> = [];

  // --- model settings ---
  #modelSettingsService: DurableObjectServiceClient<typeof modelSettingsRpcMethods> | null = null;
  #modelSettings: ModelSettingsSnapshot | null = null;
  #modelSettingsRequest: ReturnType<typeof ownModelSettingsRequest<ModelSettingsSnapshot>> | null =
    null;
  #modelSettingsRefreshGeneration = 0;
  /** A failed refresh must retry the chat connection once settings recover. */
  #modelSettingsRecovering = false;
  /** A review change may have unblocked the connection; retry it after settings. */
  #approvalNeedsConnectionRetry = false;
  #closeModelSettingsConnection: (() => Promise<void>) | null = null;
  #localModelRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  // --- agent catalog ---
  #agentDiscovery: AbortController | null = null;
  #preparedAgentRuntimes = new Set<string>();

  // --- bootstrap ---
  #bootstrapChannel: string | null = null;
  #bootstrapGeneration: AbortController | null = null;
  #persistedChannelName: string | undefined;

  // --- agents ---
  #provisional: ProvisionalAgentLifecycle | null = null;
  #provisionalIntentRevision = 0;
  readonly #recovery: AgentRecoveryRunner;
  #recoveryKey: string | null = null;
  #effectiveConfigKey: string | null = null;
  #forkCursorWrites: Promise<void> = Promise.resolve();
  #participantsKey: string | null = null;

  readonly actions: ChatHostAgentActions;

  constructor(ports: ChatHostPorts) {
    this.#ports = ports;
    this.#uuid = ports.randomUuid ?? (() => crypto.randomUUID());
    const persisted = ports.state.get().channelName;
    this.#persistedChannelName = persisted;
    this.#cell = new StateCell(initialSnapshot(persisted ?? null));
    this.#retain = new RetainCount({ start: () => this.#start(), dispose: () => this.#dispose() });
    // A recovery failure is snapshot state (`recovery.error`) that hosts render
    // with its Retry; it is deliberately not also sent through `notify`.
    this.#recovery = new AgentRecoveryRunner((recovery) => this.#cell.update({ recovery }));
    this.actions = {
      onListTaskRules: () => this.listTaskRules(),
      onResetTaskRules: () => this.resetTaskRules(),
      onAddAgent: (channelName, channelContextId, agentId, config) =>
        this.addAgent(channelName, channelContextId, agentId, config),
      onPrepareAgent: (channelName, channelContextId, agentId, config) =>
        this.prepareAgent(channelName, channelContextId, agentId, config),
      onReplaceAgent: (channelName, participantId, agentId, config) =>
        this.replaceAgent(channelName, participantId, agentId, config),
      onRemoveAgent: (channelName, handle) => this.removeAgent(channelName, handle),
      onPersistAgentModel: (channelName, participantId, model) =>
        this.persistAgentModel(channelName, participantId, model),
      onInstallLocalModel: (modelRef) => this.installLocalModel(modelRef),
      onConnectModelProvider: (modelRef, method, browser, signal, configuration) =>
        this.connectModelProvider(modelRef, method, browser, signal, configuration),
      onSaveDefaults: (config) => this.saveDefaultAgentConfig(config),
      onParticipantsChanged: (participantIds) => this.notifyParticipantsChanged(participantIds),
    };
  }

  readonly getSnapshot = (): ChatHostSnapshot => this.#cell.getSnapshot();
  readonly subscribe = (listener: () => void): (() => void) => this.#cell.subscribe(listener);

  /** Hold the controller's live work; the last release disposes it. */
  retain(): () => void {
    return this.#retain.retain();
  }

  /** Dispose immediately regardless of holders. */
  dispose(): void {
    this.#retain.disposeNow();
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  #start(): void {
    const signal = this.#lifetime.signal;
    const ports = this.#ports;
    this.#teardown.push(ports.state.subscribe(() => this.#onStateChanged()));
    if (ports.connection) {
      this.#closeModelSettingsConnection = ownModelSettingsConnection(ports.connection, {
        current: () => this.#modelSettingsRequest,
        invalidate: () => {
          this.#modelSettings = null;
          this.#cell.update({ firstAgentModelPreflight: "checking" });
        },
        reconnect: () =>
          this.#cell.transaction(() => {
            this.#refreshModelSettings(true);
            this.#discoverAgents();
            this.#recovery.trigger();
          }),
        failure: (error) => this.#cell.update({ modelSettingsError: modelSettingsFailure(error) }),
      });
    }
    if (ports.onWorkspaceEvent) {
      this.#teardown.push(
        ports.onWorkspaceEvent("approvals-changed", () => {
          // A review transition can unblock model settings as well as the chat
          // channel. Refresh that source of truth first; the chat connection is
          // retried only after the catalog is readable again.
          this.#cell.transaction(() => {
            this.#approvalNeedsConnectionRetry = true;
            this.#refreshModelSettings(true);
            this.#ensureChannel();
            this.#recovery.trigger();
          });
        }),
        ports.onWorkspaceEvent("workspace-config-changed", () =>
          this.#cell.transaction(() => {
            this.#refreshModelSettings(true);
            this.#recovery.trigger();
          })
        ),
        // A publication changed the workspace's units: the agent catalog is
        // stale, and an installed agent whose worker was missing or broken may
        // be launchable now.
        ports.onWorkspaceEvent("units-changed", () =>
          this.#cell.transaction(() => {
            this.#discoverAgents();
            this.#recovery.trigger();
          })
        )
      );
    }
    if (ports.localModels) {
      this.#teardown.push(
        ports.localModels.onChange(() => {
          if (signal.aborted || this.#localModelRefreshTimer !== null) return;
          this.#localModelRefreshTimer = setTimeout(() => {
            this.#localModelRefreshTimer = null;
            if (signal.aborted) return;
            void this.loadModelSettings(true).catch((error) => {
              console.warn(
                "[ChatHost] Failed to refresh model settings after local model event:",
                error
              );
            });
          }, LOCAL_MODEL_REFRESH_DEBOUNCE_MS);
        }),
        () => {
          if (this.#localModelRefreshTimer !== null) clearTimeout(this.#localModelRefreshTimer);
          this.#localModelRefreshTimer = null;
        }
      );
    }
    if (ports.recoveryCoordinator) {
      this.#teardown.push(
        ports.recoveryCoordinator.registerResubscribeHandler(
          `chat-initial-agent-runtime:${ports.instanceId}`,
          () => this.#prepareInitialAgentRuntime(this.getSnapshot().availableAgents),
          { includeCurrentGeneration: false }
        )
      );
    }
    this.#cell.transaction(() => {
      this.#refreshModelSettings(false);
      this.#discoverAgents();
      this.#ensureChannel();
      this.#reconcileState();
    });
  }

  #dispose(): void {
    this.#lifetime.abort(new Error("Chat host closed"));
    for (const off of this.#teardown.splice(0)) off();
    this.#agentDiscovery?.abort();
    this.#bootstrapGeneration?.abort();
    this.#recovery.dispose();
    this.#provisionalIntentRevision += 1;
    const lifecycle = this.#provisional;
    this.#provisional = null;
    void lifecycle?.dispose().catch((error) => {
      console.warn("[ChatHost] Failed to dispose provisional agent:", error);
    });
    const close = this.#closeModelSettingsConnection;
    this.#closeModelSettingsConnection = null;
    void close?.().catch((error) => console.error("[ChatHost] Model discovery closure failed:", error));
  }

  // ===========================================================================
  // State-args input
  // ===========================================================================

  #onStateChanged(): void {
    if (this.#lifetime.signal.aborted) return;
    this.#cell.transaction(() => this.#reconcileState());
  }

  /** Derive from the latest durable state and start the reactions it implies. */
  #reconcileState(): void {
    const state = this.#ports.state.get();
    // Channel identity.
    if (state.channelName !== this.#persistedChannelName) {
      this.#persistedChannelName = state.channelName;
      this.#ensureChannel();
    }
    this.#cell.update({ channelName: state.channelName ?? this.#bootstrapChannel });
    // Effective default agent config.
    const workspaceDefault = this.getSnapshot().workspaceDefaultAgentConfig;
    const effectiveKey = canonicalJson({ agentConfig: state.agentConfig ?? {}, workspaceDefault });
    if (effectiveKey !== this.#effectiveConfigKey) {
      this.#effectiveConfigKey = effectiveKey;
      this.#cell.update({
        effectiveDefaultAgentConfig: effectiveDefaultAgentConfig(
          state.agentConfig ?? {},
          workspaceDefault
        ),
      });
    }
    // Installed-agent recovery: a changed channel/agent set/config starts a
    // fresh recovery instead of inheriting a cancelled attempt's progress.
    const channelName = state.channelName;
    const installed = state.installedAgents ?? [];
    const recoveryInputs =
      channelName && installed.length > 0
        ? {
            channelName,
            installed,
            agentConfig: state.agentConfig,
            systemPrompt: state.systemPrompt,
            systemPromptMode: state.systemPromptMode,
          }
        : null;
    const recoveryKey = recoveryInputs ? canonicalJson(recoveryInputs) : "none";
    if (recoveryKey !== this.#recoveryKey) {
      this.#recoveryKey = recoveryKey;
      this.#recovery.run(
        recoveryInputs
          ? (signal, progress) => this.#recoverInstalledAgents(recoveryInputs, signal, progress)
          : null
      );
    }
  }

  // ===========================================================================
  // Channel bootstrap
  // ===========================================================================

  /** Mint the channel once and keep persisting that exact identity. */
  #ensureChannel(): void {
    if (this.#ports.state.get().channelName || !this.#ports.contextId) return;
    if (this.#lifetime.signal.aborted) return;
    // Generating a new channel on every attempt would split the live
    // subscription from the durable host state; dropping the rejected promise
    // would leave it provisional forever.
    const channelName = (this.#bootstrapChannel ??= `chat-${this.#uuid().slice(0, 8)}`);
    this.#cell.update({ channelName });
    this.#bootstrapGeneration?.abort();
    const generation = new AbortController();
    this.#bootstrapGeneration = generation;
    void this.#ports.state.patch({ channelName }).catch((error: unknown) => {
      if (generation.signal.aborted || this.#lifetime.signal.aborted) return;
      if (isReviewPending(error)) {
        const timer = setTimeout(() => {
          if (!generation.signal.aborted) this.#ensureChannel();
        }, BOOTSTRAP_REVIEW_REPERSIST_MS);
        generation.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
        return;
      }
      console.warn("[ChatHost] Failed to persist the bootstrap channel:", errorMessage(error));
    });
  }

  // ===========================================================================
  // Model settings
  // ===========================================================================

  #modelSettingsClient(): DurableObjectServiceClient<typeof modelSettingsRpcMethods> {
    this.#modelSettingsService ??= createDurableObjectServiceClient(
      this.#ports.rpc,
      MODEL_SETTINGS_SERVICE_PROTOCOL,
      modelSettingsRpcMethods
    );
    return this.#modelSettingsService;
  }

  #applyModelSettings(settings: ModelSettingsSnapshot): void {
    this.#modelSettings = settings;
    const defaultEntry = settings.catalog.models.find((model) => model.ref === settings.defaultModel);
    const defaultIsUsable = isModelUsable(defaultEntry);
    this.#cell.transaction(() => {
      // An unusable fallback needs setup. An installed local fallback is still
      // an explicit first-use choice: it differs materially from a configured
      // cloud provider. The inline first-agent preflight owns both.
      this.#cell.update({
        modelCatalog: settings.catalog,
        workspaceDefaultModelRef: settings.defaultModel,
        workspaceDefaultAgentConfig: settings.defaultAgentConfig,
        firstAgentModelPreflight:
          !defaultIsUsable ||
          (settings.defaultModelSource === "fallback" && defaultEntry?.provider === LOCAL_PROVIDER_ID)
            ? "selection-required"
            : "ready",
      });
      this.#reconcileState();
      this.#prepareInitialAgentRuntimeIfReady();
    });
    console.info("[ChatHost] model settings ready", {
      defaultModel: settings.defaultModel,
      defaultModelSource: settings.defaultModelSource,
      defaultAvailability: defaultEntry?.availability.state ?? "missing",
    });
  }

  /**
   * Read model settings. Every caller joins the one existing flight, including
   * its original failure; `refresh` discards a cached snapshot.
   */
  loadModelSettings(refresh = false): Promise<ModelSettingsSnapshot> {
    if (this.#modelSettingsRequest) return this.#modelSettingsRequest.promise;
    if (!refresh && this.#modelSettings) return Promise.resolve(this.#modelSettings);
    this.#modelSettings = null;
    this.#cell.update({ firstAgentModelPreflight: "checking", modelSettingsError: null });
    const request = ownModelSettingsRequest(async (signal) => {
      const settings = await this.#modelSettingsClient().callWithOptions("getSettings", [], {
        signal,
      });
      signal.throwIfAborted();
      this.#applyModelSettings(settings);
      return settings;
    });
    this.#modelSettingsRequest = request;
    request.promise = request.promise.finally(() => {
      if (this.#modelSettingsRequest === request) this.#modelSettingsRequest = null;
    });
    return request.promise;
  }

  /** Re-read model settings (the "Retry" affordance of a discovery error). */
  retryModelSettings(): void {
    this.#refreshModelSettings(true);
  }

  #refreshModelSettings(refresh: boolean): void {
    const generation = ++this.#modelSettingsRefreshGeneration;
    const current = () =>
      generation === this.#modelSettingsRefreshGeneration && !this.#lifetime.signal.aborted;
    void this.loadModelSettings(refresh).then(
      () => {
        if (!current()) return;
        if (!this.#modelSettingsRecovering && !this.#approvalNeedsConnectionRetry) return;
        this.#modelSettingsRecovering = false;
        this.#approvalNeedsConnectionRetry = false;
        this.#signalConnectionRetry();
      },
      (error: unknown) => {
        if (!current()) return;
        this.#modelSettingsRecovering = true;
        this.#cell.update({ modelSettingsError: modelSettingsFailure(error) });
      }
    );
  }

  /** Workspace defaults (model + behavior), freshly read. */
  async resolveWorkspaceDefaultAgentConfig(): Promise<DefaultAgentConfig> {
    return (await this.loadModelSettings(true)).defaultAgentConfig;
  }

  #signalConnectionRetry(): void {
    this.#cell.transaction(() => {
      this.#cell.update((snapshot) => ({
        connectionRetrySignal: snapshot.connectionRetrySignal + 1,
      }));
      // A connection that may have been blocked by review may also have hidden
      // the agent catalog.
      this.#discoverAgents();
    });
  }

  // ===========================================================================
  // Agent catalog
  // ===========================================================================

  /** Re-read the agent catalog (the "Retry" affordance of a catalog error). */
  retryAgentCatalog(): void {
    this.#discoverAgents();
  }

  /**
   * Read the agent catalog once. There is no re-poll: during a cold bootstrap
   * the catalog fills as units are published, and each publication raises the
   * workspace `units-changed` event, which re-runs this read (as do a decided
   * review, a config change and a transport reconnect).
   */
  #discoverAgents(): void {
    this.#agentDiscovery?.abort();
    if (this.#lifetime.signal.aborted) return;
    const generation = new AbortController();
    this.#agentDiscovery = generation;
    const { signal } = generation;
    void this.#ports.rpc
      .call("main", mainRpcMethods["workers.listSources"], [], { signal })
      .then((sources) => {
        if (signal.aborted) return;
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
                  : agentSubscriptionConfigSchema.parse(source.agent.defaultConfig),
              proposedHandle: source.name.split("-")[0] ?? source.name,
            });
          }
        }
        this.#cell.transaction(() => {
          this.#cell.update({ availableAgents: agents, agentCatalogError: null });
          this.#prepareInitialAgentRuntimeIfReady();
        });
        console.info("[ChatHost] agent source catalog read", {
          sourceCount: sources.length,
          agentCount: agents.length,
        });
      })
      .catch((error: unknown) => {
        if (signal.aborted) return;
        // A pending review is not a failure: the approval event re-reads.
        if (isReviewPending(error)) return;
        console.warn("[ChatHost] Failed to load worker sources:", error);
        this.#cell.update({
          agentCatalogError: userFacingError(
            "Couldn't load the list of agents",
            "Agents you already added keep working. Retry; the list also refreshes when the workspace changes.",
            error
          ),
        });
      });
  }

  /**
   * Speculatively build the first agent's runtime once model discovery has
   * crossed its user-visible readiness boundary, so a cold dependency install
   * can never delay the setup decision it is meant to accelerate.
   */
  #prepareInitialAgentRuntimeIfReady(): void {
    const snapshot = this.getSnapshot();
    if (snapshot.firstAgentModelPreflight === "checking") return;
    void this.#prepareInitialAgentRuntime(snapshot.availableAgents).catch((error) => {
      if (!isRpcConnectionLost(error)) {
        console.warn("[ChatHost] Initial agent runtime preparation failed:", errorMessage(error));
      }
    });
  }

  async #prepareInitialAgentRuntime(agents: AvailableAgent[]): Promise<void> {
    if (agents.length === 0 || !this.#ports.contextId) return;
    const preferredSource = this.#ports.state.get().agentSource;
    const source =
      agents.find((agent) => agent.id === preferredSource)?.id ??
      agents.find((agent) => agent.id === DEFAULT_AGENT_WORKER_SOURCE)?.id ??
      agents[0]!.id;
    const ref = `ctx:${this.#ports.contextId}`;
    const preparationKey = `${ref}\0${source}`;
    if (this.#preparedAgentRuntimes.has(preparationKey)) return;
    this.#preparedAgentRuntimes.add(preparationKey);
    // The host owns the product choice; the build service only prepares
    // immutable bytes at speculative priority. No entity is created and no
    // credential is inspected until the ordinary launch path commits.
    try {
      const report = await this.#ports.rpc.call("main", mainRpcMethods["build.getBuildReport"], [
        source,
        ref,
        { priority: "speculative" },
      ]);
      if (report.status === "ok") return;
      this.#preparedAgentRuntimes.delete(preparationKey);
      console.warn("[ChatHost] Initial agent runtime preparation failed", {
        source,
        status: report.status,
      });
    } catch (error) {
      this.#preparedAgentRuntimes.delete(preparationKey);
      throw error;
    }
  }

  // ===========================================================================
  // Recovery
  // ===========================================================================

  /** Attempt recovery again now (the "Retry" affordance of a failure). */
  retryAgentRecovery(): void {
    this.#recovery.trigger();
  }

  /**
   * The channel's participants changed (the session reports its roster). A
   * departure can leave an installed agent missing, so recovery re-checks.
   */
  notifyParticipantsChanged(participantIds: readonly string[]): void {
    const key = [...participantIds].sort().join("\0");
    const previous = this.#participantsKey;
    this.#participantsKey = key;
    if (previous === null || previous === key) return;
    const left = previous.split("\0").some((id) => id && !participantIds.includes(id));
    if (left) this.#recovery.trigger();
  }

  /**
   * The agents a conversation actually has, as installed-agent records. A
   * conversation's installed agents are a function of its own roster, never
   * carried over from the conversation the host came from: a fork's agents are
   * clones with their own keys, and recovering the source's keys into the
   * fork's context collides with the originals.
   */
  async rosterAgents(channelId: string): Promise<InstalledAgentRecord[]> {
    const signal = new AbortController().signal;
    const service = await resolveDurableObjectService(
      this.#ports.rpc,
      CHANNEL_SERVICE_PROTOCOL,
      channelId,
      { signal }
    );
    if (service.kind !== "durable-object" || !service.targetId) {
      throw new Error("Channel service must resolve to a Durable Object service");
    }
    const participants = await this.#ports.rpc.call(
      service.targetId,
      channelClientRpcMethods["getParticipants"],
      [],
      { signal }
    );
    const agents: InstalledAgentRecord[] = [];
    for (const participant of participants) {
      const target = parseDoTargetId(participant.participantId);
      const handle = participant.metadata?.["handle"];
      if (!target || participant.metadata?.["type"] !== "agent" || typeof handle !== "string") {
        continue;
      }
      agents.push({
        agentId: target.className,
        handle,
        key: target.objectKey,
        source: target.source,
        className: target.className,
      });
    }
    return agents;
  }

  /**
   * The persisted per-conversation state a surface must adopt when it moves to
   * `channelId` (a fork, or any other conversation): the channel and the agents
   * on that channel's own roster. Every surface that switches conversation
   * applies this patch instead of carrying its current state over.
   */
  async conversationState(channelId: string): Promise<{
    channelName: string;
    installedAgents: InstalledAgentRecord[] | null;
  }> {
    const agents = await this.rosterAgents(channelId);
    return { channelName: channelId, installedAgents: agents.length > 0 ? agents : null };
  }

  async #channelDurableObjects(channelId: string, signal: AbortSignal): Promise<ChannelDORef[]> {
    const channelService = await resolveDurableObjectService(
      this.#ports.rpc,
      CHANNEL_SERVICE_PROTOCOL,
      channelId,
      { signal }
    );
    if (channelService.kind !== "durable-object" || !channelService.targetId) {
      throw new Error("Channel service must resolve to a Durable Object service");
    }
    const participants = await this.#ports.rpc.call(
      channelService.targetId,
      channelClientRpcMethods["getParticipants"],
      [],
      { signal }
    );
    return participants
      .map((participant) => parseDoTargetId(participant.participantId))
      .filter((participant): participant is ChannelDORef => participant !== null);
  }

  async #recoverInstalledAgents(
    inputs: {
      channelName: string;
      installed: InstalledAgentRecord[];
      agentConfig?: Record<string, unknown>;
      systemPrompt?: string;
      systemPromptMode?: ChatHostState["systemPromptMode"];
    },
    signal: AbortSignal,
    progress: AgentRecoveryProgress
  ): Promise<void> {
    const contextId = requireChatContextId(this.#ports.contextId);
    const dos = await this.#channelDurableObjects(inputs.channelName, signal);
    signal.throwIfAborted();
    const missing = inputs.installed.filter(
      (agent) =>
        !dos.some(
          (participant) =>
            participant.source === agent.source &&
            participant.className === agent.className &&
            participant.objectKey === agent.key
        )
    );
    if (missing.length === 0) return;
    progress.missing(missing.map((agent) => agent.handle));
    for (const agent of missing) {
      const { subscribeConfig } = buildAgentSubscriptionConfig({
        handle: agent.handle,
        globalConfig: inputs.agentConfig,
        perAgentConfig: agent.config,
        systemPrompt: inputs.systemPrompt,
        systemPromptMode: inputs.systemPromptMode,
      });
      await createAndSubscribeAgent(this.#ports.rpc, this.#ports.waitForReview, {
        source: agent.source,
        className: agent.className,
        key: agent.key,
        channelId: inputs.channelName,
        channelContextId: contextId,
        config: subscribeConfig,
        replay: true,
      });
      signal.throwIfAborted();
    }
  }

  // ===========================================================================
  // Agents
  // ===========================================================================

  #provisionalLifecycle(): ProvisionalAgentLifecycle {
    this.#provisional ??= new ProvisionalAgentLifecycle(
      this.#ports.rpc,
      undefined,
      this.#ports.waitForReview
    );
    return this.#provisional;
  }

  /** Launch configuration is one coherent read of the latest durable state. */
  #buildSubscribeConfig(
    handle: string,
    config: AgentSubscriptionConfig | undefined
  ) {
    const current = this.#ports.state.get();
    return buildAgentSubscriptionConfig({
      handle,
      globalConfig: current.agentConfig,
      perAgentConfig: config,
      systemPrompt: current.systemPrompt,
      systemPromptMode: current.systemPromptMode,
    });
  }

  async #resolveAgentIntent(
    channelId: string,
    channelContextId: string | undefined,
    agentId: string | undefined,
    config: AgentSubscriptionConfig | undefined
  ): Promise<ProvisionalAgentIntent> {
    const activeContextId = requireChatContextId(this.#ports.contextId, channelContextId);
    const matched = agentId
      ? this.getSnapshot().availableAgents.find(
          (agent) => agent.id === agentId || agent.className === agentId
        )
      : undefined;
    const pinned = this.#ports.state.get();
    const source = matched?.id ?? (!agentId ? pinned.agentSource : undefined) ?? DEFAULT_AGENT_WORKER_SOURCE;
    const className =
      matched?.className ?? (!agentId ? pinned.agentClass : undefined) ?? DEFAULT_AGENT_CLASS_NAME;
    const handleFromClass =
      className === DEFAULT_AGENT_CLASS_NAME
        ? DEFAULT_AGENT_HANDLE
        : className.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
    const configHandle = typeof config?.["handle"] === "string" ? (config["handle"] as string) : "";
    const requestedHandle =
      configHandle.trim() || matched?.proposedHandle || handleFromClass || DEFAULT_AGENT_HANDLE;
    const handleBase = sanitizeHandle(requestedHandle);
    const { subscribeConfig, perAgent } = this.#buildSubscribeConfig(handleBase, config);
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
  }

  /**
   * Update the uncommitted first-agent intent. A concrete config warms a
   * provisional agent before the first send; `null` (or an already installed
   * agent) retires it. Only the latest intent is applied.
   */
  async prepareAgent(
    channelName: string,
    channelContextId: string | undefined,
    agentId: string | undefined,
    config: AgentSubscriptionConfig | null
  ): Promise<void> {
    const revision = ++this.#provisionalIntentRevision;
    if (config === null || (this.#ports.state.get().installedAgents?.length ?? 0) > 0) {
      await this.#provisional?.prepare(null);
      return;
    }
    const intent = await this.#resolveAgentIntent(channelName, channelContextId, agentId, config);
    if (revision !== this.#provisionalIntentRevision) return;
    await this.#provisionalLifecycle().prepare(intent);
  }

  /**
   * Add an agent and persist it. The first persisted agent claims the warm
   * provisional entity; later agents get a fresh handle and key.
   */
  async addAgent(
    channelName: string,
    channelContextId?: string,
    agentId?: string,
    config?: AgentSubscriptionConfig
  ): Promise<{ agentId: string; handle: string }> {
    const intent = await this.#resolveAgentIntent(channelName, channelContextId, agentId, config);
    const lifecycle = this.#provisionalLifecycle();
    const isFirstPersistedAgent = (this.#ports.state.get().installedAgents?.length ?? 0) === 0;
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
      handle = `${intent.handleBase}-${this.#uuid().slice(0, 4)}`;
      agentKey = `${handle}-${this.#uuid().slice(0, 8)}`;
      await createAndSubscribeAgent(this.#ports.rpc, this.#ports.waitForReview, {
        source,
        className,
        key: agentKey,
        channelId: channelName,
        channelContextId: intent.channelContextId,
        config: { ...intent.config, handle },
        replay: intent.replay,
      });
    }
    // The workspace default model is written ONLY by `saveDefaultAgentConfig`,
    // never as a side effect of adding an agent.
    await persistInstalledAgent(this.#ports.state, this.#ports.waitForReview, {
      agentId: className,
      handle,
      key: agentKey,
      source,
      className,
      ...(Object.keys(perAgent).length > 0 ? { config: perAgent } : {}),
    });
    return { agentId: source, handle };
  }

  /**
   * Replace an agent (by participant id) with a fresh entity, reusing its
   * handle; channel replay restores history. Without `agentId` the existing
   * worker type is reused (restart with a new model).
   */
  async replaceAgent(
    channelName: string,
    participantId: string,
    agentId?: string,
    config?: AgentSubscriptionConfig
  ): Promise<{ agentId: string; handle: string }> {
    const activeContextId = requireChatContextId(this.#ports.contextId);
    const target = parseDoTargetId(participantId);
    if (!target) throw new Error(`Cannot resolve agent participant: ${participantId}`);
    const agent = agentId
      ? this.getSnapshot().availableAgents.find((a) => a.id === agentId || a.className === agentId)
      : undefined;
    const source = agent?.id ?? target.source;
    const className = agent?.className ?? target.className;
    const configHandle = typeof config?.["handle"] === "string" ? (config["handle"] as string) : "";
    const handle = configHandle.trim() || agent?.proposedHandle || DEFAULT_AGENT_HANDLE;
    const agentKey = `${handle}-${this.#uuid().slice(0, 8)}`;
    const { subscribeConfig, perAgent } = this.#buildSubscribeConfig(handle, config);
    await unsubscribeAgentFromChannel(this.#ports.rpc, {
      source: target.source,
      className: target.className,
      key: target.objectKey,
      channelId: channelName,
    });
    await createAndSubscribeAgent(this.#ports.rpc, this.#ports.waitForReview, {
      source,
      className,
      key: agentKey,
      channelId: channelName,
      channelContextId: activeContextId,
      config: subscribeConfig,
      replay: true,
    });
    const newRecord: InstalledAgentRecord = {
      agentId: className,
      handle,
      key: agentKey,
      source,
      className,
      ...(Object.keys(perAgent).length > 0 ? { config: perAgent } : {}),
    };
    const existing = this.#ports.state.get().installedAgents ?? [];
    const replaced = existing.some((record) => record.key === target.objectKey);
    await this.#ports.state.patch({
      installedAgents: replaced
        ? existing.map((record) => (record.key === target.objectKey ? newRecord : record))
        : [...existing, newRecord],
    });
    return { agentId: source, handle };
  }

  /** Persist an agent's model choice so recovery recreates it on that model. */
  async persistAgentModel(_channelName: string, participantId: string, model: string): Promise<void> {
    const target = parseDoTargetId(participantId);
    if (!target) throw new Error(`Cannot resolve agent participant: ${participantId}`);
    const existing = this.#ports.state.get().installedAgents ?? [];
    if (!existing.some((agent) => agent.key === target.objectKey)) {
      throw new Error(`No persisted agent record found for ${participantId}`);
    }
    await this.#ports.state.patch({
      installedAgents: existing.map((agent) =>
        agent.key === target.objectKey
          ? { ...agent, config: { ...(agent.config ?? {}), model } }
          : agent
      ),
    });
  }

  /** Unsubscribe an installed agent (by handle) and drop its record. */
  async removeAgent(channelName: string, handle: string): Promise<void> {
    try {
      const current = this.#ports.state.get();
      const persisted = (current.installedAgents ?? []).find((agent) => agent.handle === handle);
      if (!persisted) throw new Error(`No installed agent record matches @${handle}`);
      await unsubscribeAgentFromChannel(this.#ports.rpc, {
        source: persisted.source,
        className: persisted.className,
        key: persisted.key,
        channelId: channelName,
      });
      await this.#ports.state.patch({
        installedAgents: (this.#ports.state.get().installedAgents ?? []).filter(
          (agent) => agent.key !== persisted.key
        ),
      });
    } catch (error) {
      console.warn(`[ChatHost] Failed to remove @${handle}:`, error);
      void this.#ports.notify?.({
        type: "error",
        title: `Couldn't remove @${handle}`,
        message: `It is still in this conversation. Try again. (Details: ${errorMessage(error)})`,
      });
      throw error;
    }
  }

  // ===========================================================================
  // Models and authority
  // ===========================================================================

  /** Explicitly replace the workspace default agent config (model + behavior). */
  async saveDefaultAgentConfig(config: DefaultAgentConfig): Promise<void> {
    const settings = await this.#modelSettingsClient().call("setDefaultAgentConfig", config);
    this.#applyModelSettings(settings);
  }

  /** Connect a model's provider (OAuth/API key), then re-read model settings. */
  async connectModelProvider(
    modelRef: string,
    method: string,
    browser: "internal" | "external",
    signal: AbortSignal,
    configuration?: Record<string, string>
  ): Promise<void> {
    const model = this.getSnapshot().modelCatalog?.models.find((entry) => entry.ref === modelRef);
    if (!model || !model.connectable)
      throw new Error("This model requires provider configuration before connecting.");
    const request = toCredentialConnectRequest(model.provider, { method, browser, configuration });
    if (!request) throw new Error("This sign-in method is unavailable. Choose another method.");
    await this.#ports.rpc.call("main", mainRpcMethods["credentials.connect"], [request], { signal });
    await this.loadModelSettings(true);
  }

  /** Start installing a local model; progress arrives through the catalog. */
  async installLocalModel(modelRef: string): Promise<ModelSetupResult> {
    try {
      if (!this.#ports.localModels) throw new Error("Local models are not available on this host.");
      await this.#ports.localModels.installModel(modelRef);
      await this.loadModelSettings(true);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  #conversationScope(): { contextId: string; channelId: string } {
    const contextId = this.#ports.contextId;
    const channelId = this.getSnapshot().channelName;
    if (!contextId || !channelId) throw new Error("Conversation has no runtime context");
    return { contextId, channelId };
  }

  /** Reusable authority rules attached to this conversation. */
  listTaskRules() {
    return this.#ports.rpc.call("main", mainRpcMethods["authority.listTaskRules"], [
      this.#conversationScope(),
    ]);
  }

  /** Revoke every reusable authority rule of this conversation; returns the count. */
  async resetTaskRules(): Promise<number> {
    const result = await this.#ports.rpc.call("main", mainRpcMethods["authority.resetTaskRules"], [
      this.#conversationScope(),
    ]);
    return result.revokedGrantCount;
  }

  // ===========================================================================
  // Fork read cursors
  // ===========================================================================

  readForkCursors(): Record<string, number> {
    return this.#ports.state.get().forkCursors ?? {};
  }

  /**
   * Persist one monotone fork read cursor. Writes are serialized so a slower
   * write can never regress a newer cursor; a failed write rejects its caller
   * and leaves the queue usable.
   */
  markForkRead(forkChannelId: string, headSeq: number): Promise<void> {
    const write = this.#forkCursorWrites.then(async () => {
      const current = this.#ports.state.get();
      const prior = current.forkCursors?.[forkChannelId] ?? 0;
      if (prior >= headSeq) return;
      await this.#ports.state.patch({
        forkCursors: { ...(current.forkCursors ?? {}), [forkChannelId]: headSeq },
      });
    });
    this.#forkCursorWrites = write.then(
      () => undefined,
      () => undefined
    );
    return write;
  }
}
