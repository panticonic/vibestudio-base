import { createTypedRpcServiceClient } from "@vibestudio/shared/typedRpcServiceClient";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
/**
 * useAgenticChat — Thin composer hook.
 *
 * Composes useChatCore + feature hooks (pending agents, feedback, tools,
 * debug, inline UI) into the full ChatContextValue.
 *
 * Roster tracking, pending agents, debug events, dirty repo warnings, and
 * transcript projection are owned by useChatCore. Feature hooks here handle
 * the remaining domain UX: feedback, tools, inline UI, action bars, and debug
 * presentation.
 *
 * For minimal chat (no tools, no feedback, no debug), use useChatCore directly.
 * All non-React chat logic lives in the session (`@workspace/agentic-core/chat-store`);
 * this hook adds the browser-only features and registers their channel methods
 * through the session's method-provider port.
 */
import { useCallback, useMemo, useReducer, useRef, useEffect, useState } from "react";

import { fsMethods } from "@vibestudio/service-schemas/fs";
import type { ChannelConfig } from "@workspace/pubsub";
import { ScopeManager } from "@workspace/eval/scope";
import type {
  SandboxImportLoader,
  SandboxOptions,
  SandboxResult,
  ScopeBlobBackend,
} from "@workspace/eval";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  AGENTIC_PROTOCOL_VERSION,
  type ParticipantRef,
  type AgenticEvent,
} from "@workspace/agentic-protocol";
import { useChatCoreState, useChatSession } from "./core/useChatCore";
import { useChatMethodProvider, useStoreSnapshot } from "./useChatStore";
import { hostContextSlice, sessionActionsSlice, sessionStateSlice } from "./chatContextSlices";
import { useChatFeedback } from "./features/useChatFeedback";
import { useChatTools } from "./features/useChatTools";
import { buildClientEvalMethod } from "./features/clientEval";
import {
  actorForClient,
  inlineUiMethod,
  inspectCardMethod,
  loadActionBarMethod,
  type BrowserMethodRuntime,
} from "./features/browserChatMethods";
import { useChatDebug } from "./features/useChatDebug";
import { useInlineUi } from "./features/useInlineUi";
import { useActionBar } from "./features/useActionBar";
import { useMessageTypeRegistry } from "./features/useMessageTypeRegistry";
import type {
  ConnectionConfig,
  AgenticChatActions,
  ToolProvider,
  ChatSandboxValue,
  ClientParticipantMetadata,
  ChatContextValue,
  ChatInputContextValue,
  ActionBarData,
  BrowserHandoffCallerKind,
  ForkNavHandlers,
  ForkUiState,
} from "../types";
import { runtimeCallerId } from "../types";
import {
  LocalStorageScopePersistence,
  panelLocalScopeChannelId,
} from "../utils/localStorageScopePersistence";
import { scheduleBackgroundWork } from "../utils/scheduleBackgroundWork";
import { createChatSandboxValue, type ReadableStore } from "@workspace/agentic-core/chat-store";
import {
  resolveAgenticChatFeatures,
  type AgenticChatFeature,
  type ResolvedAgenticChatFeatures,
} from "../features";

const NO_INLINE_UI_MESSAGES: ChatContextValue["messages"] = [];
/** Stand-in store for a chat without fork navigation (hooks run unconditionally). */
const NO_FORKS: ReadableStore<ForkUiState | undefined> = {
  getSnapshot: () => undefined,
  subscribe: () => () => undefined,
};
/** Installed agent info passed from the host panel. */
interface InstalledAgentInfo {
  agentId: string;
  handle: string;
}
function actionBarLoadKey(
  path: string,
  props: Record<string, unknown> | undefined,
  maxHeight: number | undefined
): string {
  let propsKey = "";
  try {
    propsKey = JSON.stringify(props ?? null);
  } catch {
    propsKey = "[unserializable-props]";
  }
  return `${path}\n${propsKey}\n${maxHeight ?? ""}`;
}

function browserHandoffCallerKindFromMetadata(type: string | undefined): BrowserHandoffCallerKind {
  if (type === "client" || type === "shell") return type;
  return "panel";
}

export interface UseAgenticChatOptions {
  config: ConnectionConfig;
  channelName: string;
  channelConfig?: ChannelConfig;
  contextId?: string;
  /** Panel LABEL only (WP6 §5) — never the authoritative human identity; the
   *  channel derives that from the host-verified subject on the connection. */
  metadata?: ClientParticipantMetadata;
  tools?: ToolProvider;
  actions?: AgenticChatActions;
  theme?: "light" | "dark";
  installedAgentInfos?: InstalledAgentInfo[];
  /** Panel-supplied fork navigation + review overlay handlers (enables the fork
   *  switcher, inline fork rows, and subagent review). Absent ⇒ no fork UI. */
  forkNav?: ForkNavHandlers;
  /** Optional build-backed loader for imports used by authored UI and client evaluation. */
  importLoader?: SandboxImportLoader;
  /** Context-relative TSX file to load into the panel-local action bar on mount */
  initialActionBarFile?: string;
  /** Props for initialActionBarFile */
  initialActionBarProps?: Record<string, unknown>;
  /** Preferred max height for initialActionBarFile */
  initialActionBarMaxHeight?: number;
  /** Called when load_action_bar changes the panel-local action bar file */
  onActionBarFileChange?: (value: {
    path: string | null;
    props?: Record<string, unknown>;
    maxHeight?: number;
  }) => void | Promise<void>;
  /** Changes when the host resolves a workspace review that blocked connection. */
  connectionRetrySignal?: number;
  /**
   * Browser-owned capabilities exposed by this participant. Explicit and fixed
   * for the lifetime of the mounted participant.
   */
  features: readonly AgenticChatFeature[];
}

export interface UseAgenticChatResult {
  contextValue: ChatContextValue;
  inputContextValue: ChatInputContextValue;
  features: ResolvedAgenticChatFeatures;
}

export function useAgenticChat({
  config,
  channelName,
  channelConfig,
  contextId,
  // Panel label only — no client-declared human identity: the channel
  // stamps the account-derived identity from the host-verified subject.
  metadata: metadataOption,
  tools,
  actions,
  // No "dark" default — appearance flows from the explicit prop OR the system
  // / centralized appearance (resolved in useChatCore via resolveSystemTheme).
  theme,
  installedAgentInfos,
  forkNav,
  importLoader,
  initialActionBarFile,
  initialActionBarProps,
  initialActionBarMaxHeight,
  onActionBarFileChange,
  connectionRetrySignal,
  features: requestedFeatures,
}: UseAgenticChatOptions): UseAgenticChatResult {
  const [features] = useState(() => resolveAgenticChatFeatures(requestedFeatures));
  const metadata = useMemo<ClientParticipantMetadata>(
    () => metadataOption ?? { name: channelName, type: "panel" },
    [channelName, metadataOption]
  );
  // --- Core (durable channel trajectory events -> transcript view model) ---
  const session = useChatSession({
    config,
    channelName,
    channelConfig,
    contextId,
    metadata,
    ...(actions ? { agentHost: actions } : {}),
    ...(forkNav ? { forkNav } : {}),
  });
  const core = useChatCoreState(session, { config, channelName, theme });
  // Fork lineage (switcher, tree, inline rows, subagent review) is owned by
  // the session when the panel supplies navigation handlers.
  const forkState = useStoreSnapshot(session.forks ?? NO_FORKS);
  const scopeBlobBackend = useMemo<ScopeBlobBackend>(
    () => ({
      putText: (valueJson: string) =>
        config.rpc.call("main", mainRpcMethods["blobstore.putText"], [valueJson]),
      getText: (digest: string) =>
        config.rpc.call("main", mainRpcMethods["blobstore.getText"], [digest]),
    }),
    [config.rpc]
  );
  const scopeManager = useMemo(
    () =>
      new ScopeManager({
        channelId: panelLocalScopeChannelId(channelName, config.clientId),
        panelId: "panel-ui",
        persistence: new LocalStorageScopePersistence(scopeBlobBackend),
        rehydrators: config.scopeRehydrators,
      }),
    [channelName, config.clientId, config.scopeRehydrators, scopeBlobBackend]
  );
  const [scopeVersion, bumpScopeVersion] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    let cancelled = false;
    const unsubscribe = scopeManager.onChange(bumpScopeVersion);
    void scopeManager
      .hydrate()
      .then((result) => {
        if (cancelled) return;
        bumpScopeVersion();
        if (result.lost.length > 0) {
          console.warn(
            `[panel-ui-scope] Cold recovery lost live-only keys: [${result.lost.join(", ")}]`
          );
        }
      })
      .catch((err) => {
        if (!cancelled) console.warn("[panel-ui-scope] Failed to hydrate:", err);
      });
    const persistIfDirty = () => {
      if (!scopeManager.isDirty) return;
      void scopeManager.persist().catch((err) => {
        console.warn("[panel-ui-scope] Failed to persist:", err);
      });
    };
    const persistIfHidden = () => {
      if (document.hidden) persistIfDirty();
    };
    window.addEventListener("beforeunload", persistIfDirty);
    document.addEventListener("visibilitychange", persistIfHidden);
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("beforeunload", persistIfDirty);
      document.removeEventListener("visibilitychange", persistIfHidden);
      scopeManager.dispose();
    };
  }, [scopeManager]);
  const scope = useMemo(() => scopeManager.current, [scopeManager]);
  const scopes = useMemo(() => scopeManager.api, [scopeManager]);
  const publishTypedAgenticEvent = useCallback(
    async (
      event: AgenticEvent,
      options?: { idempotencyKey?: string }
    ): Promise<number | undefined> => {
      const client = session.client;
      if (!client) return undefined;
      return client.publish(AGENTIC_EVENT_PAYLOAD_KIND, event, {
        idempotencyKey: options?.idempotencyKey ?? crypto.randomUUID(),
      });
    },
    [core.clientRef]
  );
  // --- Mirror host-owned installed agents into transient pending badges until they join ---
  useEffect(() => {
    if (installedAgentInfos === undefined) return;
    core.setPendingAgentInfos(installedAgentInfos);
  }, [installedAgentInfos, core.setPendingAgentInfos]);
  // --- Build chat sandbox value (stale-ref safe — dereferences clientRef at call time) ---
  const chat: ChatSandboxValue = useMemo(
    () =>
      createChatSandboxValue({
        client: () => core.clientRef.current,
        publishText: core.publishText,
        focusMessage: async (messageId: string): Promise<boolean> => {
          // Message cards render with id={`message-${msg.id}`} in the same DOM
          // as sandboxed renderers — no RPC needed. Retry briefly: the card the
          // caller just created may still be folding into the transcript.
          for (let attempt = 0; attempt < 10; attempt += 1) {
            const element = document.getElementById(`message-${messageId}`);
            if (element) {
              element.scrollIntoView({ behavior: "smooth", block: "center" });
              element.animate(
                [
                  {
                    boxShadow: "0 0 0 3px var(--accent-a7)",
                    borderRadius: "8px",
                  },
                  { boxShadow: "0 0 0 3px transparent", borderRadius: "8px" },
                ],
                { duration: 1600, easing: "ease-out" }
              );
              return true;
            }
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
          return false;
        },
        contextId: contextId ?? "",
        channelId: channelName,
        rpc: config.rpc,
      }),
    [contextId, channelName, config.rpc, core.clientRef, core.publishText]
  );
  // --- Bound executeSandbox with optional host import loading wired ---
  const boundExecuteSandbox = useCallback(
    async (code: string, opts: SandboxOptions = {}): Promise<SandboxResult> => {
      const { executeSandbox } = await import("@workspace/eval/sandbox");
      return executeSandbox(code, {
        ...opts,
        ...(opts.loadImport || !importLoader ? {} : { loadImport: importLoader }),
      });
    },
    [importLoader]
  );
  const loadSourceFile = useCallback(
    async (path: string) => {
      const fsClient = createTypedRpcServiceClient(
        config.rpc,
        { targetId: "main", namespace: "fs" },
        fsMethods
      );
      return (await fsClient.readFile(path, "utf8")) as string;
    },
    [config.rpc]
  );
  // `load_action_bar({ code })` owns exactly one context-local scratch file per
  // panel. The panel persists that path like any other action-bar file, so a
  // reload restores the bar through the same file-backed state arg.
  const managedActionBarPath = `.tmp/action-bars/${config.clientId.replace(/[^A-Za-z0-9_-]/gu, "_")}.tsx`;
  const writeManagedActionBar = useCallback(
    async (code: string) => {
      const fsClient = createTypedRpcServiceClient(
        config.rpc,
        { targetId: "main", namespace: "fs" },
        fsMethods
      );
      await fsClient.writeFile(managedActionBarPath, code);
      return managedActionBarPath;
    },
    [config.rpc, managedActionBarPath]
  );
  const feedback = useChatFeedback({
    chat,
    loadImport: importLoader,
    clientRef: core.clientRef,
    connected: core.connected,
  });
  const chatTools = useChatTools({
    clientRef: core.clientRef,
    tools,
    contextId: contextId ?? "",
    executeSandbox: boundExecuteSandbox,
    chat,
    scopeManager,
  });
  const debug = useChatDebug();
  const inlineUi = useInlineUi({
    client: core.client,
    messages: features.inlineUi ? core.messages : NO_INLINE_UI_MESSAGES,
    loadSourceFile,
    loadImport: importLoader,
  });
  const messageTypes = useMessageTypeRegistry({
    client: core.client,
    messages: core.messages,
    definitions: core.messageTypes,
    loadSourceFile,
    loadImport: importLoader,
  });
  const [actionBarData, setActionBarData] = useState<ActionBarData | null>(null);
  const actionBar = useActionBar({
    data: features.actionBar ? actionBarData : null,
    loadSourceFile,
    loadImport: importLoader,
  });
  const lastLoadedActionBarKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!features.actionBar) return;
    const canonical = core.canonicalActionBar;
    if (!canonical?.source) return;
    const next: ActionBarData = {
      id: canonical.id ?? "canonical-action-bar",
      source: canonical.source,
    };
    if (canonical.author) next.author = canonical.author;
    if (canonical.turnId !== undefined) next.turnId = canonical.turnId;
    if (canonical.imports !== undefined) next.imports = canonical.imports;
    if (canonical.props !== undefined) next.props = canonical.props;
    if (canonical.maxHeight !== undefined) next.maxHeight = canonical.maxHeight;
    setActionBarData(next);
    if (canonical.source.type === "file") {
      lastLoadedActionBarKeyRef.current = actionBarLoadKey(
        canonical.source.path,
        canonical.props,
        canonical.maxHeight
      );
    }
  }, [core.canonicalActionBar, features.actionBar]);
  const publishActionBarContext = useCallback(
    async (
      action: "loaded" | "cleared",
      payload: {
        id?: string;
        path?: string;
        imports?: Record<string, string>;
        props?: Record<string, unknown>;
        maxHeight?: number;
        ok: boolean;
        error?: string;
        idempotencyKey?: string;
        requestedBy?: ParticipantRef;
        turnId?: string;
      }
    ) => {
      const client = core.clientRef.current;
      if (!client) return;
      const eventPayload: AgenticEvent<"ui.action_bar.updated">["payload"] = {
        protocol: AGENTIC_PROTOCOL_VERSION,
        uiType: "action_bar",
        ...(payload.requestedBy ? { requestedBy: payload.requestedBy } : {}),
        cleared: action === "cleared",
        result: payload.ok ? { ok: true } : { ok: false, error: payload.error },
      };
      if (payload.id !== undefined) eventPayload.id = payload.id;
      if (payload.path !== undefined) eventPayload.source = { type: "file", path: payload.path };
      if (payload.imports !== undefined) eventPayload.imports = payload.imports;
      if (payload.props !== undefined) eventPayload.props = payload.props;
      if (payload.maxHeight !== undefined) eventPayload.maxHeight = payload.maxHeight;
      await publishTypedAgenticEvent(
        {
          kind: "ui.action_bar.updated",
          actor: actorForClient(client, metadata),
          ...(payload.turnId ? { turnId: payload.turnId as never } : {}),
          payload: eventPayload,
          createdAt: new Date().toISOString(),
        },
        {
          idempotencyKey: payload.idempotencyKey ?? `ui:action-bar:${crypto.randomUUID()}`,
        }
      );
    },
    [core.clientRef, metadata, publishTypedAgenticEvent]
  );
  const loadActionBarFromFile = useCallback(
    async ({
      path,
      props,
      maxHeight,
      imports,
      persistStateArgs = true,
      idempotencyKey,
      requestedBy,
      turnId,
    }: {
      path: string;
      props?: Record<string, unknown>;
      maxHeight?: number;
      imports?: Record<string, string>;
      persistStateArgs?: boolean;
      idempotencyKey?: string;
      /** The participant that asked for this bar (the `load_action_bar` caller). */
      requestedBy?: ParticipantRef;
      /** The caller's turn that asked for this bar. */
      turnId?: string;
    }): Promise<
      | {
          ok: true;
          id: string;
        }
      | {
          ok: false;
          error: string;
        }
    > => {
      const trimmedPath = path.trim();
      if (!trimmedPath) return { ok: false, error: "Missing path" };
      try {
        await loadSourceFile(trimmedPath);
        const id = crypto.randomUUID();
        setActionBarData({
          id,
          source: { type: "file", path: trimmedPath },
          imports,
          props,
          maxHeight,
          ...(turnId ? { turnId } : {}),
        });
        lastLoadedActionBarKeyRef.current = actionBarLoadKey(trimmedPath, props, maxHeight);
        if (persistStateArgs) {
          await onActionBarFileChange?.({
            path: trimmedPath,
            props,
            maxHeight,
          });
        }
        await publishActionBarContext("loaded", {
          id,
          path: trimmedPath,
          imports,
          props,
          maxHeight,
          ok: true,
          idempotencyKey,
          requestedBy,
          turnId,
        });
        return { ok: true, id };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await publishActionBarContext("loaded", {
          path: trimmedPath,
          imports,
          props,
          maxHeight,
          ok: false,
          error,
          idempotencyKey,
          requestedBy,
          turnId,
        });
        return { ok: false, error };
      }
    },
    [loadSourceFile, onActionBarFileChange, publishActionBarContext]
  );
  const clearActionBar = useCallback(
    async ({
      persistStateArgs = true,
      idempotencyKey,
      requestedBy,
      turnId,
    }: {
      persistStateArgs?: boolean;
      idempotencyKey?: string;
      requestedBy?: ParticipantRef;
      turnId?: string;
    } = {}) => {
      setActionBarData(null);
      lastLoadedActionBarKeyRef.current = null;
      if (persistStateArgs) {
        await onActionBarFileChange?.({ path: null });
      }
      await publishActionBarContext("cleared", {
        ok: true,
        idempotencyKey,
        requestedBy,
        turnId,
      });
    },
    [onActionBarFileChange, publishActionBarContext]
  );
  const updateActionBarMaxHeight = useCallback(
    (
      maxHeight: number,
      options?: {
        saveState?: boolean;
      }
    ) => {
      setActionBarData((current) => {
        if (!current) return current;
        const next = { ...current, maxHeight };
        if (options?.saveState !== false && current.source.type === "file") {
          void onActionBarFileChange?.({
            path: current.source.path,
            props: current.props,
            maxHeight,
          });
        }
        return next;
      });
    },
    [onActionBarFileChange]
  );
  useEffect(() => {
    if (!features.actionBar || !core.connected || !initialActionBarFile) return;
    const loadKey = actionBarLoadKey(
      initialActionBarFile,
      initialActionBarProps,
      initialActionBarMaxHeight
    );
    if (lastLoadedActionBarKeyRef.current === loadKey) return;
    // State-arg action bars decorate the chat; their file validation and
    // publication must not enter the panel RPC path ahead of agent startup.
    return scheduleBackgroundWork(() => {
      void loadActionBarFromFile({
        path: initialActionBarFile,
        props: initialActionBarProps,
        maxHeight: initialActionBarMaxHeight,
        persistStateArgs: false,
        idempotencyKey: `ui:initial-action-bar:${channelName}:${loadKey}`,
      });
    });
  }, [
    channelName,
    core.connected,
    initialActionBarFile,
    initialActionBarProps,
    initialActionBarMaxHeight,
    loadActionBarFromFile,
    features.actionBar,
  ]);
  // --- Method providers: each browser feature advertises its own group through
  // the session's method-provider port. Registration is a layout effect, so it
  // precedes the passive effect that starts the join; a provider is read when
  // a join starts, so its methods are fixed per join. ---
  useChatMethodProvider(session, "tools", chatTools.buildToolMethods);
  useChatMethodProvider(
    session,
    "feedback",
    features.feedback ? feedback.buildFeedbackMethods : undefined
  );
  // inspect_card reads the live transcript and renderer registry at call time.
  const messageTypeComponentsRef = useRef(messageTypes.messageTypeComponents);
  messageTypeComponentsRef.current = messageTypes.messageTypeComponents;
  const provideInspectCard = useCallback(
    () => ({
      inspect_card: inspectCardMethod(() => ({
        messages: session.getSnapshot().messages,
        registry: messageTypeComponentsRef.current,
      })),
    }),
    [session]
  );
  useChatMethodProvider(session, "inspect-card", provideInspectCard);
  const browserMethodRuntime = useMemo<BrowserMethodRuntime>(
    () => ({
      getClient: () => session.client,
      metadata,
      ...(importLoader ? { importLoader } : {}),
      loadSourceFile,
      publishTypedAgenticEvent,
      managedActionBarPath,
      writeManagedActionBar,
      loadActionBarFromFile,
      clearActionBar,
    }),
    [
      session,
      metadata,
      importLoader,
      loadSourceFile,
      publishTypedAgenticEvent,
      managedActionBarPath,
      writeManagedActionBar,
      loadActionBarFromFile,
      clearActionBar,
    ]
  );
  const provideInlineUi = useCallback(
    () => ({ inline_ui: inlineUiMethod(browserMethodRuntime) }),
    [browserMethodRuntime]
  );
  useChatMethodProvider(session, "inline-ui", features.inlineUi ? provideInlineUi : undefined);
  const provideActionBar = useCallback(
    () => ({ load_action_bar: loadActionBarMethod(browserMethodRuntime) }),
    [browserMethodRuntime]
  );
  useChatMethodProvider(session, "action-bar", features.actionBar ? provideActionBar : undefined);
  const provideClientEval = useCallback(
    () => ({
      client_eval: buildClientEvalMethod({
        importLoader,
        executeSandbox: boundExecuteSandbox,
        loadSourceFile,
        getChat: () => chat,
        scopeManager,
      }),
    }),
    [importLoader, boundExecuteSandbox, loadSourceFile, chat, scopeManager]
  );
  useChatMethodProvider(
    session,
    "client-eval",
    features.clientEval ? provideClientEval : undefined
  );

  // --- Connection: the session owns the join loop. A host signal that a
  // blocking review resolved retries a stalled join; a live join is kept. ---
  useEffect(() => {
    session.start();
  }, [session]);
  const observedRetrySignal = useRef(connectionRetrySignal);
  useEffect(() => {
    if (observedRetrySignal.current === connectionRetrySignal) return;
    observedRetrySignal.current = connectionRetrySignal;
    session.reconnect("host-unblocked");
  }, [session, connectionRetrySignal]);

  // --- Deferred first-agent flow (inline config + pre-send delivery queue),
  // owned by the session: the composer submits through it, so the first
  // message(s) are held until the agent it spawns joins the roster. ---
  const { deferredAgent } = useStoreSnapshot(session.deferredAgent);
  const inputContextValue = useMemo<ChatInputContextValue>(
    () => ({ ...core.inputContextValue, onSendMessage: session.submit }),
    [core.inputContextValue, session]
  );

  // Keep the observer transport identity independent from transcript and UI
  // updates. Recreating this wrapper as the parent conversation changes makes
  // every mounted child transcript disconnect and start a fresh replay.
  const childTranscript = useMemo(
    () => ({
      config,
      metadata: {
        name: metadata.name,
        type: metadata.type,
        ...(metadata.handle ? { handle: metadata.handle } : {}),
        ...(metadata.panelId ? { panelId: metadata.panelId } : {}),
      },
    }),
    [
      config.clientId,
      config.rpc,
      config.protocol,
      config.recoveryCoordinator,
      config.replayMessageLimit,
      config.deliveryMode,
      metadata.name,
      metadata.type,
      metadata.handle,
      metadata.panelId,
    ]
  );

  // --- Assemble the context from independently memoized slices ---
  const sessionSnapshot = useStoreSnapshot(session);
  const sessionState = useMemo(() => sessionStateSlice(sessionSnapshot), [sessionSnapshot]);
  const sessionActions = useMemo(
    () => sessionActionsSlice(session, core.clientRef),
    [session, core.clientRef]
  );
  const host = useMemo(() => hostContextSlice(session, actions), [session, actions]);
  const browser = useMemo(
    () => ({
      channelId: channelName,
      browserHandoffCaller: {
        id: runtimeCallerId(config.rpc.selfId),
        kind: browserHandoffCallerKindFromMetadata(metadata.type),
      },
      // Always persistent: transcript state is projected from the durable log.
      sessionEnabled: true,
      chat,
      panelScopeId: config.clientId,
      scope,
      scopes,
      scopeManager,
      inlineUiComponents: inlineUi.inlineUiComponents,
      messageTypeComponents: messageTypes.messageTypeComponents,
      actionBar: actionBar.actionBar,
      onActionBarMaxHeightChange: updateActionBarMaxHeight,
      debugConsoleAgent: debug.debugConsoleAgent,
      onDebugConsoleChange: debug.setDebugConsoleAgent,
      activeFeedbacks: feedback.activeFeedbacks,
      onFeedbackDismiss: feedback.onFeedbackDismiss,
      onFeedbackError: feedback.onFeedbackError,
      // Resolved appearance (explicit prop OR system) — never a "dark" literal.
      theme: core.theme,
      toolApproval: chatTools.toolApprovalValue,
      // Lets subagent cards open an observer connection on a child's task
      // channel; reuses this panel's own transport config.
      childTranscript,
      // MDX messages resolve their imports through the same loader as inline UI.
      importLoader,
    }),
    [
      channelName,
      config.rpc.selfId,
      config.clientId,
      metadata.type,
      chat,
      scope,
      scopes,
      scopeManager,
      scopeVersion,
      inlineUi.inlineUiComponents,
      messageTypes.messageTypeComponents,
      actionBar.actionBar,
      updateActionBarMaxHeight,
      debug.debugConsoleAgent,
      debug.setDebugConsoleAgent,
      feedback.activeFeedbacks,
      feedback.onFeedbackDismiss,
      feedback.onFeedbackError,
      core.theme,
      chatTools.toolApprovalValue,
      childTranscript,
      importLoader,
    ]
  );
  const contextValue: ChatContextValue = useMemo(
    () => ({
      ...sessionState,
      ...sessionActions,
      ...host,
      ...browser,
      deferredAgent,
      // Fork UI is enabled only when the panel wired navigation handlers.
      forkState: session.forks ? forkState : undefined,
    }),
    [sessionState, sessionActions, host, browser, deferredAgent, session, forkState]
  );
  return { contextValue, inputContextValue, features };
}
