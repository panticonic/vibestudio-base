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
 */
import { useCallback, useMemo, useReducer, useRef, useEffect, useState } from "react";
import { z } from "zod";
import { createTypedServiceClient } from "@vibestudio/shared/typedServiceClient";
import { fsMethods } from "@vibestudio/service-schemas/fs";
import type { ChannelConfig, MethodExecutionContext, PubSubClient } from "@workspace/pubsub";
import { ScopeManager } from "@workspace/eval/scope";
import type {
  SandboxImportLoader,
  SandboxOptions,
  SandboxResult,
  ScopeBlobBackend
} from "@workspace/eval";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  AGENTIC_PROTOCOL_VERSION,
  type ParticipantKind,
  participantRefFromMetadata,
  type ParticipantRef,
  type AgenticEvent
} from "@workspace/agentic-protocol";
import { useChatCore } from "./core/useChatCore";
import { useForkLineage } from "./useForkLineage";
import { useDeferredAgent } from "./useDeferredAgent";
import { useChatFeedback } from "./features/useChatFeedback";
import { useChatTools } from "./features/useChatTools";
import { buildClientEvalMethod } from "./features/clientEval";
import { validateComponentSource } from "./features/validateComponentSource";
import { useChatDebug } from "./features/useChatDebug";
import { useInlineUi } from "./features/useInlineUi";
import { useActionBar } from "./features/useActionBar";
import { useMessageTypeRegistry } from "./features/useMessageTypeRegistry";
import type {
  ConnectionConfig,
  AgenticChatActions,
  ToolProvider,
  ChatSandboxValue,
  ChatParticipantMetadata,
  ClientParticipantMetadata,
  ChatContextValue,
  ChatInputContextValue,
  ActionBarData,
  BrowserHandoffCallerKind,
  ForkNavHandlers
} from "../types";
import { channelParticipantId, runtimeCallerId } from "../types";
import type { MessageTypeComponentEntry } from "../types";
import { customInspectorPayload } from "../components/CustomMessage";
import { unwrapChatMethodResult } from "@workspace/agentic-core";
import type { ChatMethodResult, AgentSubscriptionConfig } from "@workspace/agentic-core";
import {
  LocalStorageScopePersistence,
  panelLocalScopeChannelId
} from "../utils/localStorageScopePersistence";
import { scheduleBackgroundWork } from "../utils/scheduleBackgroundWork";
import { sendSandboxText, type SandboxSendOptions } from "./sandboxSend";
import { connectionRetryDelayMs, isTransientConnectionFailure } from "./connectionRetry";
import {
  composeAgenticChatMethods,
  resolveAgenticChatFeatures,
  type AgenticChatFeature,
  type ResolvedAgenticChatFeatures
} from "../features";

const NO_INLINE_UI_MESSAGES: ChatContextValue["messages"] = [];
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

function actorKindFromMetadata(type: string | undefined, participantId?: string): ParticipantKind {
  // A `user:<userId>` participant id is the channel-stamped human identity
  // (WP6 §4) — it always resolves to the semantic `user` role, regardless of
  // the client-supplied metadata type.
  if (participantId?.startsWith("user:")) return "user";
  if (type === "agent" || type === "system" || type === "panel" || type === "external") return type;
  return "user";
}

function browserHandoffCallerKindFromMetadata(type: string | undefined): BrowserHandoffCallerKind {
  if (type === "app" || type === "shell") return type;
  return "panel";
}

function actorForClient(
  client: Pick<PubSubClient<ChatParticipantMetadata>, "clientId" | "roster">,
  metadata: ClientParticipantMetadata
) {
  const id = client.clientId ?? metadata.handle ?? "panel";
  // Live identity projection (WP6 §3/§5): the channel stamps human
  // participants with `id: user:<userId>` and the ACCOUNT-derived
  // handle/displayName on the roster row — prefer that over the local panel
  // label, so events carry the real account participant and profile.
  const self = client.roster?.[id]?.metadata;
  const merged = { ...metadata, ...(self ?? {}) };
  return {
    kind: actorKindFromMetadata(merged.type ?? metadata.type, id),
    id,
    displayName: merged.name ?? merged.handle ?? id,
    metadata: { ...merged }
  };
}

async function waitForMethodHandle<T>(
  handle: { result: Promise<T>; cancel?: () => Promise<void> },
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortCleanup: (() => void) | undefined;
  const cancel = () => {
    void handle.cancel?.().catch((err) => {
      console.warn("[useAgenticChat] Failed to cancel method handle:", err);
    });
  };
  try {
    const blockers: Array<Promise<never>> = [];
    if (options?.timeoutMs !== undefined && options.timeoutMs > 0) {
      const timeoutMs = options.timeoutMs;
      blockers.push(
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            cancel();
            reject(new Error(`Method call timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        })
      );
    }
    if (options?.signal) {
      if (options.signal.aborted) {
        cancel();
        throw new Error("Method call aborted");
      }
      blockers.push(
        new Promise<never>((_, reject) => {
          const onAbort = () => {
            cancel();
            reject(new Error("Method call aborted"));
          };
          options.signal!.addEventListener("abort", onAbort, { once: true });
          abortCleanup = () => options.signal!.removeEventListener("abort", onAbort);
        })
      );
    }
    return await Promise.race([handle.result, ...blockers]);
  } finally {
    if (timeout) clearTimeout(timeout);
    abortCleanup?.();
  }
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
  const core = useChatCore({
    config,
    channelName,
    channelConfig,
    contextId,
    metadata,
    theme,
  });
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const retryConnection = useCallback(() => {
    core.dismissConnectionError();
    core.hasConnectedRef.current = false;
    setConnectionAttempt((attempt) => attempt + 1);
  }, [core.dismissConnectionError, core.hasConnectedRef]);
  // Fork lineage state + actions (switcher, tree, inline rows, subagent review).
  // Only enabled when the panel supplies navigation handlers.
  const forkState = useForkLineage({
    rpc: config.rpc,
    channelId: channelName,
    contextId,
    selfId: core.selfId,
    selfMetadata: {
      type: metadata.type,
      name: metadata.name,
      handle: metadata.handle
    },
    messages: core.messages,
    replaySettled: core.replaySettled,
    retrySignal: connectionRetrySignal,
    client: core.client,
    nav: forkNav
  });
  const scopeBlobBackend = useMemo<ScopeBlobBackend>(
    () => ({
      putText: (valueJson: string) =>
        config.rpc.call("main", "blobstore.putText", [valueJson]) as Promise<{
          digest: string;
          size: number;
        }>,
      getText: (digest: string) =>
        config.rpc.call("main", "blobstore.getText", [digest]) as Promise<string | null>
    }),
    [config.rpc]
  );
  const scopeManager = useMemo(
    () =>
      new ScopeManager({
        channelId: panelLocalScopeChannelId(channelName, config.clientId),
        panelId: "panel-ui",
        persistence: new LocalStorageScopePersistence(scopeBlobBackend)
      }),
    [channelName, config.clientId, scopeBlobBackend]
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
      const client = core.clientRef.current;
      if (!client) return undefined;
      return client.publish(AGENTIC_EVENT_PAYLOAD_KIND, event, {
        idempotencyKey: options?.idempotencyKey ?? crypto.randomUUID()
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
    () => ({
      send: (content: string, opts?: SandboxSendOptions) => {
        if (!core.clientRef.current) {
          return Promise.reject(new Error("Agentic chat is not connected"));
        }
        return sendSandboxText(core.publishText, content, opts, crypto.randomUUID());
      },
      publish: (
        eventType: string,
        payload: unknown,
        opts?: {
          idempotencyKey?: string;
        }
      ) => {
        return core.clientRef.current!.publish(eventType, payload, {
          ...opts,
          idempotencyKey: opts?.idempotencyKey ?? crypto.randomUUID()
        }) as Promise<unknown>;
      },
      publishCustomMessage: (input, opts) => {
        return core.clientRef.current!.publishCustomMessage(input, {
          idempotencyKey: opts?.idempotencyKey ?? crypto.randomUUID()
        });
      },
      updateCustomMessage: (messageId, update, opts) => {
        return core.clientRef.current!.updateCustomMessage(messageId, update, {
          idempotencyKey: opts?.idempotencyKey ?? crypto.randomUUID()
        });
      },
      registerMessageType: (input, opts) => {
        return core.clientRef.current!.registerMessageType(
          input,
          opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined
        );
      },
      clearMessageType: (typeId, opts) => {
        return core.clientRef.current!.clearMessageType(
          typeId,
          opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined
        );
      },
      getMessageType: (typeId) => {
        return core.clientRef.current!.getMessageType(typeId);
      },
      getMessageTypes: () => {
        return core.clientRef.current!.getMessageTypes();
      },
      getParticipants: async () => {
        return Object.values(core.clientRef.current?.roster ?? {}).map(({ id, ref, metadata }) => ({
          id,
          ref,
          type: metadata.type,
          name: metadata.name,
          isPerson: metadata.type === "user",
          isAgent: metadata.type === "agent",
          ...(metadata.handle ? { handle: metadata.handle } : {}),
          ...(metadata.methods ? { methods: metadata.methods } : {})
        }));
      },
      replayEnvelope: (envelopeId: string) => {
        return core.clientRef.current!.getEnvelope(envelopeId);
      },
      callMethod: async (
        pid: string,
        method: string,
        callArgs: unknown,
        options?: { timeoutMs?: number; signal?: AbortSignal }
      ) => {
        const handle = core.clientRef.current!.callMethod(pid, method, callArgs, options);
        const result = await waitForMethodHandle(
          handle as {
            result: Promise<ChatMethodResult>;
            cancel?: () => Promise<void>;
          },
          options
        );
        return unwrapChatMethodResult(result);
      },
      callMethodResult: async (
        pid: string,
        method: string,
        callArgs: unknown,
        options?: { timeoutMs?: number; signal?: AbortSignal }
      ) => {
        const handle = core.clientRef.current!.callMethod(pid, method, callArgs, options);
        return waitForMethodHandle(
          handle as {
            result: Promise<ChatMethodResult>;
            cancel?: () => Promise<void>;
          },
          options
        );
      },
      participantByHandle: async (rawHandle: string) => {
        const handle = rawHandle.startsWith("@") ? rawHandle.slice(1) : rawHandle;
        const roster = core.clientRef.current?.roster ?? {};
        return (
          Object.values(roster).find((participant) => {
            const metadataHandle = participant.metadata?.handle;
            return typeof metadataHandle === "string" && metadataHandle === handle;
          }) ?? null
        );
      },
      callMethodByHandle: async (
        rawHandle: string,
        method: string,
        callArgs: unknown,
        options?: { timeoutMs?: number; signal?: AbortSignal }
      ) => {
        const handle = rawHandle.startsWith("@") ? rawHandle.slice(1) : rawHandle;
        const roster = core.clientRef.current?.roster ?? {};
        const participant = Object.values(roster).find((item) => item.metadata?.handle === handle);
        if (!participant) throw new Error(`No participant with handle @${handle}`);
        const methodHandle = core.clientRef.current!.callMethod(
          participant.id,
          method,
          callArgs,
          options
        );
        const result = await waitForMethodHandle(
          methodHandle as {
            result: Promise<ChatMethodResult>;
            cancel?: () => Promise<void>;
          },
          options
        );
        return unwrapChatMethodResult(result);
      },
      callMethodResultByHandle: async (
        rawHandle: string,
        method: string,
        callArgs: unknown,
        options?: { timeoutMs?: number; signal?: AbortSignal }
      ) => {
        const handle = rawHandle.startsWith("@") ? rawHandle.slice(1) : rawHandle;
        const roster = core.clientRef.current?.roster ?? {};
        const participant = Object.values(roster).find((item) => item.metadata?.handle === handle);
        if (!participant) throw new Error(`No participant with handle @${handle}`);
        const methodHandle = core.clientRef.current!.callMethod(
          participant.id,
          method,
          callArgs,
          options
        );
        return waitForMethodHandle(
          methodHandle as {
            result: Promise<ChatMethodResult>;
            cancel?: () => Promise<void>;
          },
          options
        );
      },
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
                  borderRadius: "8px"
                },
                { boxShadow: "0 0 0 3px transparent", borderRadius: "8px" }
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
      rpc: config.rpc
    }),
    [contextId, channelName, config.rpc, core.clientRef, metadata, publishTypedAgenticEvent]
  );
  // --- Bound executeSandbox with optional host import loading wired ---
  const boundExecuteSandbox = useCallback(
    async (code: string, opts: SandboxOptions = {}): Promise<SandboxResult> => {
      const { executeSandbox } = await import("@workspace/eval/sandbox");
      return executeSandbox(code, {
        ...opts,
        ...(opts.loadImport || !importLoader ? {} : { loadImport: importLoader })
      });
    },
    [importLoader]
  );
  const loadSourceFile = useCallback(
    async (path: string) => {
      const fsClient = createTypedServiceClient("fs", fsMethods, (service, method, args) =>
        config.rpc.call("main", `${service}.${method}`, args)
      );
      return (await fsClient.readFile(path, "utf8")) as string;
    },
    [config.rpc]
  );
  const feedback = useChatFeedback({
    chat,
    loadImport: importLoader,
    clientRef: core.clientRef,
    connected: core.connected
  });
  const chatTools = useChatTools({
    clientRef: core.clientRef,
    tools,
    contextId: contextId ?? "",
    executeSandbox: boundExecuteSandbox,
    chat,
    scopeManager
  });
  const debug = useChatDebug();
  const inlineUi = useInlineUi({
    client: core.client,
    messages: features.inlineUi ? core.messages : NO_INLINE_UI_MESSAGES,
    loadSourceFile,
    loadImport: importLoader
  });
  const messageTypes = useMessageTypeRegistry({
    client: core.client,
    messages: core.messages,
    definitions: core.messageTypes,
    loadSourceFile,
    loadImport: importLoader
  });
  const [actionBarData, setActionBarData] = useState<ActionBarData | null>(null);
  const actionBar = useActionBar({
    data: features.actionBar ? actionBarData : null,
    loadSourceFile,
    loadImport: importLoader
  });
  const lastLoadedActionBarKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!features.actionBar) return;
    const canonical = core.canonicalActionBar;
    if (!canonical?.source) return;
    const next: ActionBarData = {
      id: canonical.id ?? "canonical-action-bar",
      source: canonical.source
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
        result: payload.ok ? { ok: true } : { ok: false, error: payload.error }
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
          createdAt: new Date().toISOString()
        },
        {
          idempotencyKey: payload.idempotencyKey ?? `ui:action-bar:${crypto.randomUUID()}`
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
      turnId
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
          ...(turnId ? { turnId } : {})
        });
        lastLoadedActionBarKeyRef.current = actionBarLoadKey(trimmedPath, props, maxHeight);
        if (persistStateArgs) {
          await onActionBarFileChange?.({
            path: trimmedPath,
            props,
            maxHeight
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
          turnId
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
          turnId
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
      turnId
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
      await publishActionBarContext("cleared", { ok: true, idempotencyKey, requestedBy, turnId });
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
            maxHeight
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
        idempotencyKey: `ui:initial-action-bar:${channelName}:${loadKey}`
      });
    });
  }, [
    channelName,
    core.connected,
    initialActionBarFile,
    initialActionBarProps,
    initialActionBarMaxHeight,
    loadActionBarFromFile,
    features.actionBar
  ]);
  // --- Stable refs for connection effect (avoids unstable object deps) ---
  const feedbackRef = useRef(feedback);
  const chatToolsRef = useRef(chatTools);
  const actionsRef = useRef(actions);
  feedbackRef.current = feedback;
  chatToolsRef.current = chatTools;
  actionsRef.current = actions;
  const connectionMethodsRef = useRef({
    clearActionBar,
    loadActionBarFromFile,
    metadata,
    publishTypedAgenticEvent,
    importLoader,
    boundExecuteSandbox,
    loadSourceFile,
    chat,
    scopeManager
  });
  connectionMethodsRef.current = {
    clearActionBar,
    loadActionBarFromFile,
    metadata,
    publishTypedAgenticEvent,
    importLoader,
    boundExecuteSandbox,
    loadSourceFile,
    chat,
    scopeManager
  };
  // Live snapshot for the inspect_card method: agents debug a card by reading
  // the same data the UI's "Copy details" produces.
  const cardInspectionRef = useRef<{
    messages: typeof core.messages;
    registry: Map<string, MessageTypeComponentEntry>;
  }>({ messages: [], registry: new Map() });
  cardInspectionRef.current = {
    messages: core.messages,
    registry: messageTypes.messageTypeComponents
  };
  // --- Connect to channel on mount ---
  useEffect(() => {
    if (!channelName || !config.rpc) return;
    if (core.hasConnectedRef.current) return;
    core.hasConnectedRef.current = true;
    const controller = new AbortController();
    let cancelled = false;
    let connected = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    async function doConnect() {
      let transientAttempt = 0;
      for (;;) {
        try {
          const methodRuntime = connectionMethodsRef.current;
          const toolMethods = chatToolsRef.current.buildToolMethods();
          const methods = composeAgenticChatMethods(
            toolMethods,
            features.feedback ? feedbackRef.current.buildFeedbackMethods() : undefined,
            {
              inspect_card: {
                description:
                  "Inspect a custom message card in this conversation: wire payload, renderer registry status " +
                  "(ready / load stage / error), definition metadata, and full update history. Use this when a " +
                  "card you published is not rendering, looks wrong, or a user reports a stuck spinner — it " +
                  "returns exactly what the user's 'Copy details' button shows. Parameters: { messageId: string }.",
                parameters: z.object({
                  messageId: z.string().describe("The custom message id (custom.started messageId)")
                }),
                execute: async (args: unknown, ctx: MethodExecutionContext) => {
                  const { messageId } = args as { messageId?: string };
                  if (!messageId)
                    return ctx.result({ ok: false, error: "Missing messageId" }, { isError: true });
                  const snapshot = cardInspectionRef.current;
                  const message = snapshot.messages.find(
                    (item) => item.custom?.messageId === messageId
                  );
                  if (!message?.custom) {
                    const known = snapshot.messages
                      .filter((item) => item.custom)
                      .map((item) => `${item.custom!.typeId}:${item.custom!.messageId}`);
                    return ctx.result({
                      ok: false,
                      error: `No custom message "${messageId}" in this channel view.`,
                      knownCards: known
                    }, { isError: true });
                  }
                  return {
                    ok: true,
                    details: customInspectorPayload(
                      message.custom,
                      snapshot.registry.get(message.custom.typeId)
                    )
                  };
                }
              }
            },
            features.inlineUi
              ? {
                  inline_ui: {
                    description: `Render an interactive UI component inline in the chat transcript. Non-blocking: it returns immediately and the user interacts whenever they choose.

**When to use:** whenever a visual or interactive answer serves the user better than prose — the user does not need to ask for UI. Reach for it for plans and itineraries, comparisons, data the user will explore, calculators and what-if tools, checklists and multi-step setup, dashboards, and anything the user may come back to. For presentation that needs no state or code, write MDX components directly in your message instead (the same response components are available there).

**Contrast with other tools:**
- \`eval\`: agent-triggered side effects; runs immediately and returns a result.
- \`inline_ui\`: rich presentation plus user-triggered side effects; persists in the transcript.
- \`ask_user\` / \`feedback_form\` / \`feedback_custom\`: block until the user answers and return the answer to you.

**Fastest path — response components** from \`@workspace/react\`: \`Chart\`, \`Stats\`, \`Compare\`, \`Timeline\`, \`Checklist\`, \`PlaceMap\`, \`Choices\`, \`Calculator\`, \`ActionButton\`, \`Image\`, \`Video\`. Fill them with props; compose them with Radix layout. Read \`skills/visualize/COMPONENTS.md\` for their props.

**The component receives { props, chat, scope, scopes, inlineUi }:**
- props: data you pass via the props parameter
- inlineUi: stable identity \`{ id, renderedAt }\`; \`renderedAt\` changes whenever the same ID is rendered again and can trigger a data-refresh effect
- chat:
  - chat.send(content, { metadata: { interaction: { source, kind, action, targetId } } }) — send a user message that starts a new agent turn; the structured \`interaction\` tells you exactly which control was used. Response components such as \`Choices\` and \`ActionButton\` do this for you.
  - chat.rpc.call(target, method, args) — call a runtime service; \`args\` is the complete positional argument array. Example: chat.rpc.call("main", "fs.readFile", ["/src/config.ts"])
  - chat.publish(type, payload, options?) — publish a typed non-message event.
  - chat.contextId, chat.channelId — current identifiers
- scope: panel-local durable UI state shared by inline_ui, feedback_custom, and the action bar in this panel instance. Serializable values persist in localStorage across panel reloads; nonserializable values are live-only and dropped on restore.
- scopes: scopes.save(), scopes.push(), scopes.list(), scopes.get(id)

**Lifecycle:** The card starts expanded and auto-collapses above 400px; users can expand or collapse it. Pass a stable \`id\` for one evolving surface: a later render by the same participant with that ID replaces the card and moves it to the newest position. Omit \`id\` for a new independent card. **Result:** \`{ ok: true, id }\` means the source compiled and the card was published. A compile failure (syntax error, unresolved import) is returned directly as an error result \`{ ok: false, error, compileError: true }\` with the compiler message, and nothing is rendered; fix the source and call again. Render-time and props failures happen after publishing: a ui-feedback note naming the inline UI id and the error starts a repair turn when you are idle, or follows your current turn (failures of what you publish in a repair turn wait for your next turn); fix the source and render again with the same id.

**Imports:** react, @radix-ui/themes, @radix-ui/react-icons, @workspace/react, @workspace/runtime. Provide either \`code\` or \`path\`; \`path\` reads a context-relative TSX file, supports static relative imports, and infers bare package imports from the nearest package.json. Use \`imports\` for explicit package versions.
**Must use** \`export default\`. Root with an unframed layout that stays usable at a 320px card width.

**Example:**
\`\`\`tsx
import { Flex } from "@radix-ui/themes";
import { Chart, Choices, Stats } from "@workspace/react";

export default function Spending({ props }) {
  return (
    <Flex direction="column" gap="3" p="2" style={{ width: "100%", minWidth: 0 }}>
      <Stats items={[{ label: "Total", value: props.total }, { label: "vs. last month", value: props.delta, tone: "negative" }]} />
      <Chart type="bar" data={props.months} x="month" y={["groceries", "dining"]} valueFormat="currency" stacked />
      <Choices id="spending-next" question="What should we look at next?" options={[{ label: "Cut dining costs" }, { label: "Set a monthly budget" }]} />
    </Flex>
  );
}
\`\`\``,
                    parameters: z.object({
                      id: z
                        .string()
                        .trim()
                        .min(1)
                        .optional()
                        .describe(
                          "Stable component ID. Reusing it updates and bumps the existing card; omit it to create a new card."
                        ),
                      code: z
                        .string()
                        .optional()
                        .describe(
                          "TSX source code for the component. Provide either code or path."
                        ),
                      path: z
                        .string()
                        .optional()
                        .describe(
                          "Context-relative TSX file to render instead of inline code. Supports static relative imports."
                        ),
                      imports: z
                        .record(z.string(), z.string())
                        .optional()
                        .describe("On-demand package builds. Same semantics as eval imports."),
                      props: z
                        .record(z.unknown())
                        .optional()
                        .describe("Props passed to the component as { props }")
                    }),
                    execute: async (args: unknown, ctx: MethodExecutionContext) => {
                      const {
                        id: requestedId,
                        code,
                        path,
                        imports,
                        props
                      } = args as {
                        id?: string;
                        code?: string;
                        path?: string;
                        imports?: Record<string, string>;
                        props?: Record<string, unknown>;
                      };
                      const trimmedPath = path?.trim();
                      const sourceCode = trimmedPath
                        ? await methodRuntime.loadSourceFile(trimmedPath)
                        : code;
                      if (!sourceCode) {
                        return ctx.result(
                          { ok: false, error: "Missing code or path" },
                          { isError: true }
                        );
                      }
                      const validation = await validateComponentSource(
                        { code: sourceCode, ...(trimmedPath ? { path: trimmedPath } : {}) },
                        {
                          imports,
                          loadSourceFile: methodRuntime.loadSourceFile,
                          loadImport: methodRuntime.importLoader
                        }
                      );
                      if (!validation.ok) {
                        return ctx.result({ ...validation, compileError: true }, { isError: true });
                      }
                      const client = core.clientRef.current;
                      if (!client)
                        return ctx.result(
                          { ok: false, error: "Not connected" },
                          { isError: true }
                        );
                      const id = requestedId?.trim() || crypto.randomUUID();
                      const source = trimmedPath
                        ? { type: "file" as const, path: trimmedPath }
                        : { type: "code" as const, code: code! };
                      const eventPayload: AgenticEvent<"ui.inline_rendered">["payload"] = {
                        protocol: AGENTIC_PROTOCOL_VERSION,
                        uiType: "inline",
                        requestedBy: participantRefFromMetadata(ctx.callerId, client.roster?.[ctx.callerId]?.metadata),
                        id,
                        source
                      };
                      if (imports !== undefined) eventPayload.imports = imports;
                      if (props !== undefined) eventPayload.props = props;
                      await methodRuntime.publishTypedAgenticEvent(
                        {
                          kind: "ui.inline_rendered",
                          actor: actorForClient(client, methodRuntime.metadata),
                          ...(ctx.turnId ? { turnId: ctx.turnId as never } : {}),
                          payload: eventPayload,
                          createdAt: new Date().toISOString()
                        },
                        // The component ID is intentionally reusable. Event idempotency
                        // remains unique so a later render is reduced as an update.
                        {
                          idempotencyKey: `ui:inline:${id}:${crypto.randomUUID()}`
                        }
                      );
                      return { ok: true, id };
                    }
                  }
                }
              : undefined,
            features.actionBar
              ? {
                  load_action_bar: {
                    description: `Load, replace, or clear a compact persistent action bar at the top of this chat panel.

Use this for small always-available controls or status for the current workflow.
The TSX source is read from a file in this panel's current filesystem context.
The loaded component receives { props, chat, scope, scopes }, supports the same
imports as inline_ui, supports static relative imports from the loaded file,
infers bare package imports from the nearest package.json when possible, and
must export default.

Unlike inline_ui, load_action_bar does not add visible chat history. The latest
loaded file replaces any previous action bar for this panel only. Other panels
connected to this channel may be in different filesystem contexts.
Keep it compact; the panel clamps the rendered height to a small scrollable area.
Use package imports available to inline_ui plus relative imports for local helper files.

Result: \`{ ok: true, id }\` means the file compiled and the bar was loaded. A compile failure (syntax error, unresolved import) is returned directly as an error result \`{ ok: false, error, compileError: true }\` and the current bar is left unchanged. Render-time and props failures arrive afterward as ui-feedback notes: one starts a repair turn when you are idle, or follows your current turn.`,
                    parameters: z.object({
                      path: z
                        .string()
                        .optional()
                        .describe(
                          "Context-relative TSX file to load. Required unless clear is true."
                        ),
                      imports: z
                        .record(z.string(), z.string())
                        .optional()
                        .describe("On-demand package builds. Same semantics as eval imports."),
                      props: z
                        .record(z.unknown())
                        .optional()
                        .describe("Props passed to the component as { props }"),
                      maxHeight: z
                        .number()
                        .optional()
                        .describe(
                          "Preferred maximum height in pixels. Defaults to 180 and is clamped between 64 and 360."
                        ),
                      clear: z
                        .boolean()
                        .optional()
                        .describe("When true, remove the current action bar.")
                    }),
                    execute: async (args: unknown, ctx: MethodExecutionContext) => {
                      const { path, imports, props, maxHeight, clear } = args as {
                        path?: string;
                        imports?: Record<string, string>;
                        props?: Record<string, unknown>;
                        maxHeight?: number;
                        clear?: boolean;
                      };
                      const client = core.clientRef.current;
                      if (!client)
                        return ctx.result(
                          { ok: false, error: "Not connected" },
                          { isError: true }
                        );
                      const requestedBy = participantRefFromMetadata(ctx.callerId, client.roster?.[ctx.callerId]?.metadata);
                      if (clear) {
                        await methodRuntime.clearActionBar({ requestedBy, turnId: ctx.turnId });
                        return { ok: true, cleared: true };
                      }
                      if (!path)
                        return ctx.result(
                          { ok: false, error: "Missing path" },
                          { isError: true }
                        );
                      const barPath = path.trim();
                      if (barPath) {
                        const validation = await validateComponentSource(
                          { code: await methodRuntime.loadSourceFile(barPath), path: barPath },
                          {
                            imports,
                            loadSourceFile: methodRuntime.loadSourceFile,
                            loadImport: methodRuntime.importLoader
                          }
                        );
                        if (!validation.ok) {
                          return ctx.result({ ...validation, compileError: true }, { isError: true });
                        }
                      }
                      const result = await methodRuntime.loadActionBarFromFile({
                        path,
                        imports,
                        props,
                        maxHeight,
                        requestedBy,
                        turnId: ctx.turnId
                      });
                      return result.ok ? result : ctx.result(result, { isError: true });
                    }
                  }
                }
              : undefined,
            features.clientEval
              ? {
                  client_eval: buildClientEvalMethod({
                    importLoader: methodRuntime.importLoader,
                    executeSandbox: methodRuntime.boundExecuteSandbox,
                    loadSourceFile: methodRuntime.loadSourceFile,
                    getChat: () => methodRuntime.chat,
                    scopeManager: methodRuntime.scopeManager
                  })
                }
              : undefined
          );
          await core.connectToChannel({
            signal: controller.signal,
            channelId: channelName,
            methods,
            channelConfig,
            contextId
          });
          connected = true;
          return;
        } catch (err) {
          if (cancelled) return;
          if (!isTransientConnectionFailure(err)) {
            console.error("[Chat] Connection error:", err);
            return;
          }
          const delayMs = connectionRetryDelayMs(transientAttempt++);
          // A failure this loop is about to retry is not news. A first startup
          // builds the workspace while the panel is already connecting, so a
          // call can time out on a slow machine and succeed moments later;
          // saying so at warning level reports a defect for something that
          // healed itself, and the retry that follows is the real answer.
          console.debug(`[Chat] Transient connection failure; retrying in ${delayMs}ms`, err);
          await new Promise<void>((resolve) => {
            retryTimer = setTimeout(resolve, delayMs);
          });
          retryTimer = undefined;
          if (cancelled) return;
        }
      }
    }
    void doConnect();
    return () => {
      cancelled = true;
      controller.abort();
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      if (!connected) core.hasConnectedRef.current = false;
    };
  }, [
    channelName,
    channelConfig,
    contextId,
    core.connectToChannel,
    config.rpc,
    core.hasConnectedRef,
    core.selfIdRef,
    core.clientRef,
    connectionAttempt,
    connectionRetrySignal,
    features
  ]);
  // --- Wrap platform actions ---
  const handleAddAgent = useCallback(
    async (agentId?: string, config?: AgentSubscriptionConfig) => {
      if (!actions?.onAddAgent) return;
      const launcherContextId = core.clientRef.current?.contextId;
      await actions.onAddAgent(channelName, launcherContextId, agentId, config);
    },
    [channelName, core.clientRef, actions]
  );
  const handlePrepareAgent = useCallback(
    async (agentId: string | undefined, config: AgentSubscriptionConfig | null) => {
      if (!actions?.onPrepareAgent) return;
      const launcherContextId = core.clientRef.current?.contextId;
      await actions.onPrepareAgent(channelName, launcherContextId, agentId, config);
    },
    [channelName, core.clientRef, actions]
  );
  const handleReplaceAgent = useCallback(
    async (participantId: string, agentId?: string, config?: AgentSubscriptionConfig) => {
      if (!actions?.onReplaceAgent) return;
      await actions.onReplaceAgent(channelName, participantId, agentId, config);
    },
    [channelName, actions]
  );
  const handlePersistAgentModel = useCallback(
    async (participantId: string, model: string) => {
      if (!actions?.onPersistAgentModel) return;
      await actions.onPersistAgentModel(channelName, participantId, model);
    },
    [channelName, actions]
  );
  const handleRemoveAgent = useCallback(
    async (handle: string) => {
      if (!actions?.onRemoveAgent) return;
      await actions.onRemoveAgent(channelName, handle);
    },
    [channelName, actions]
  );
  const sessionEnabled = true; // Always persistent: transcript state is projected from the durable PubSub log.
  const onAddAgent = actions?.onAddAgent ? handleAddAgent : undefined;
  const onPrepareAgent = actions?.onPrepareAgent ? handlePrepareAgent : undefined;
  const onReplaceAgent = actions?.onReplaceAgent ? handleReplaceAgent : undefined;
  const onPersistAgentModel = actions?.onPersistAgentModel ? handlePersistAgentModel : undefined;
  const onInstallLocalModel = actions?.onInstallLocalModel;
  const onConnectModelProvider = actions?.onConnectModelProvider;
  const availableAgents = actions?.availableAgents;
  const modelCatalog = actions?.modelCatalog;
  const defaultModelRef = actions?.defaultModelRef;
  const defaultAgentConfig = actions?.defaultAgentConfig;
  const firstAgentModelPreflight = actions?.firstAgentModelPreflight;
  const onSaveDefaults = actions?.onSaveDefaults;
  const onRemoveAgent = actions?.onRemoveAgent ? handleRemoveAgent : undefined;
  const onFocusPanel = actions?.onFocusPanel;
  const onReloadPanel = actions?.onReloadPanel;
  const onOpenChannel = actions?.onOpenChannel;
  const onNewConversation = actions?.onNewConversation;
  const onListTaskRules = actions?.onListTaskRules;
  const onResetTaskRules = actions?.onResetTaskRules;
  const onOpenLocalModelsLog = actions?.onOpenLocalModelsLog;
  const onOpenLocalModels = actions?.onOpenLocalModels;

  // --- Deferred first-agent flow (inline config + pre-send delivery queue) ---
  const clearComposer = useCallback(() => {
    core.handleInputChange("");
    core.setPendingImages([]);
  }, [core.handleInputChange, core.setPendingImages]);
  const resolveOpeningRequest = useCallback(
    async (outcome: "deliver" | "cancel") => {
      const client = core.clientRef.current;
      if (!client) throw new Error("Conversation is not connected");
      await client.resolveOpeningRequest(outcome);
    },
    [core.clientRef],
  );
  const { deferredAgent, sendMessage: deferredSendMessage } = useDeferredAgent({
    participants: core.participants,
    pendingAgents: core.pendingAgents,
    input: core.input,
    clearComposer,
    publishText: core.publishText,
    maybeSetDefaultTitle: core.maybeSetDefaultTitle,
    coreSendMessage: core.sendMessage,
    onAddAgent,
    onPrepareAgent,
    availableAgents: availableAgents ?? [],
    modelCatalog: modelCatalog ?? null,
    defaultModelRef,
    defaultAgentConfig,
    firstAgentModelPreflight,
    firstAgentPending: core.initialization?.firstAgentPending ?? false,
    openingRequest: core.initialization?.openingRequest,
    resolveOpeningRequest,
    channelName,
    replaySettled: core.replaySettled,
  });
  // Pre-send queue intercept: the composer's send becomes the deferred wrapper,
  // which holds the first message(s) until the agent it spawns joins the roster.
  const inputContextValue = useMemo<ChatInputContextValue>(
    () => ({ ...core.inputContextValue, onSendMessage: deferredSendMessage }),
    [core.inputContextValue, deferredSendMessage]
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
        ...(metadata.panelId ? { panelId: metadata.panelId } : {})
      }
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
      metadata.panelId
    ]
  );

  // --- Assemble context values ---
  const contextValue: ChatContextValue = useMemo(
    () => ({
      connected: core.connected,
      replaySettled: core.replaySettled,
      status: core.status,
      channelId: channelName,
      channelTitle: core.channelTitle,
      browserHandoffCaller: {
        id: runtimeCallerId(config.rpc.selfId),
        kind: browserHandoffCallerKindFromMetadata(metadata.type)
      },
      sessionEnabled,
      connectionError: core.connectionError,
      dismissConnectionError: core.dismissConnectionError,
      retryConnection,
      chat,
      clientRef: core.clientRef,
      panelScopeId: config.clientId,
      scope,
      scopes,
      scopeManager,
      messages: core.messages,
      inlineUiComponents: inlineUi.inlineUiComponents,
      messageTypeComponents: messageTypes.messageTypeComponents,
      actionBar: actionBar.actionBar,
      onActionBarMaxHeightChange: updateActionBarMaxHeight,
      hasMoreHistory: core.hasMoreHistory,
      loadingMore: core.loadingMore,
      selfId: core.selfId ? channelParticipantId(core.selfId) : null,
      participants: core.participants,
      allParticipants: core.allParticipants,
      debugEvents: core.debugEvents,
      debugConsoleAgent: debug.debugConsoleAgent,
      dirtyRepoWarnings: core.dirtyRepoWarnings,
      pendingAgents: core.pendingAgents,
      deferredAgent,
      activeFeedbacks: feedback.activeFeedbacks,
      // Resolved appearance (explicit prop OR system) — never a "dark" literal.
      theme: core.theme,
      agentBusy: core.agentBusy,
      hasOpenTurn: core.hasOpenTurn,
      editPendingMessage: core.editPendingMessage,
      cancelPendingMessage: core.cancelPendingMessage,
      flushOutboxAndInterrupt: core.flushOutboxAndInterrupt,
      primaryActionIntent: core.primaryActionIntent,
      flushNarration: core.flushNarration,
      undoableAction: core.undoableAction,
      undoLastAction: core.undoLastAction,
      pendingSendCount: core.pendingSendCount,
      afterTurnMessageIds: core.afterTurnMessageIds,
      onLoadEarlierMessages: core.loadEarlierMessages,
      onInterrupt: core.handleInterruptAgent,
      onCancelInvocation: core.handleCancelInvocation,
      onCallMethod: core.handleCallMethod,
      onCallMethodResult: core.handleCallMethodResult,
      onFeedbackDismiss: feedback.onFeedbackDismiss,
      onFeedbackError: feedback.onFeedbackError,
      onDebugConsoleChange: debug.setDebugConsoleAgent,
      onDismissDirtyWarning: core.onDismissDirtyWarning,
      onAddAgent,
      onReplaceAgent,
      onPersistAgentModel,
      onInstallLocalModel,
      onConnectModelProvider,
      availableAgents,
      modelCatalog,
      defaultModelRef,
      defaultAgentConfig,
      onSaveDefaults,
      onRemoveAgent,
      onFocusPanel,
      onReloadPanel,
      onOpenChannel,
      onNewConversation,
      onListTaskRules,
      onResetTaskRules,
      onOpenLocalModelsLog,
      onOpenLocalModels,
      toolApproval: chatTools.toolApprovalValue,
      // Fork UI is enabled only when the panel wired navigation handlers.
      forkState: forkNav ? forkState : undefined,
      // Lets subagent cards open an observer connection on a child's task
      // channel; reuses this panel's own transport config.
      childTranscript
    }),
    [
      core.connected,
      core.replaySettled,
      core.status,
      core.channelTitle,
      core.selfId,
      config.rpc.selfId,
      metadata.type,
      core.connectionError,
      core.dismissConnectionError,
      retryConnection,
      config.clientId,
      channelName,
      sessionEnabled,
      chat,
      core.clientRef,
      scope,
      scopes,
      scopeManager,
      scopeVersion,
      core.messages,
      inlineUi.inlineUiComponents,
      messageTypes.messageTypeComponents,
      actionBar.actionBar,
      updateActionBarMaxHeight,
      core.hasMoreHistory,
      core.loadingMore,
      core.participants,
      core.allParticipants,
      core.debugEvents,
      debug.debugConsoleAgent,
      core.dirtyRepoWarnings,
      core.pendingAgents,
      deferredAgent,
      feedback.activeFeedbacks,
      core.theme,
      core.agentBusy,
      core.hasOpenTurn,
      core.editPendingMessage,
      core.cancelPendingMessage,
      core.flushOutboxAndInterrupt,
      core.primaryActionIntent,
      core.flushNarration,
      core.undoableAction,
      core.undoLastAction,
      core.pendingSendCount,
      core.afterTurnMessageIds,
      core.loadEarlierMessages,
      core.handleInterruptAgent,
      core.handleCallMethod,
      core.handleCallMethodResult,
      feedback.onFeedbackDismiss,
      feedback.onFeedbackError,
      debug.setDebugConsoleAgent,
      core.onDismissDirtyWarning,
      onAddAgent,
      onReplaceAgent,
      onPersistAgentModel,
      onInstallLocalModel,
      onConnectModelProvider,
      availableAgents,
      modelCatalog,
      defaultModelRef,
      defaultAgentConfig,
      onSaveDefaults,
      onRemoveAgent,
      onFocusPanel,
      onReloadPanel,
      onOpenChannel,
      onNewConversation,
      onListTaskRules,
      onResetTaskRules,
      onOpenLocalModelsLog,
      onOpenLocalModels,
      chatTools.toolApprovalValue,
      forkNav,
      forkState,
      childTranscript
    ]
  );
  return { contextValue, inputContextValue, features };
}
