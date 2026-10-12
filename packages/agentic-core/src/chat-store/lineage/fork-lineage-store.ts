/**
 * ForkLineageStore — durable fork lineage of one conversation channel.
 *
 * Owns provenance and labels, the direct-child and sibling forks with their
 * live heads and unread badges, the lineage invalidation stream, read-cursor
 * persistence, external-fork notification, the lazy lineage tree, and the fork
 * / rename / archive / switch actions.
 *
 * Identity (rpc, channel, context) is fixed per instance. Everything that
 * changes over time arrives through `setInputs()`; every input and every
 * internal state change runs one deterministic `reconcile()` that starts or
 * retires the keyed work it implies. Async work belongs to AbortController
 * generations; the channel client's `onReconnect` is the only resubscribe
 * trigger (no timers).
 */

import { channelClientRpcMethods } from "@workspace/pubsub/rpc-contract";
import { createRpcMethodCaller, type RpcMethodArgs } from "@vibestudio/shared/rpcMethods";
import { resolveDurableObjectService } from "@vibestudio/service-schemas/clients/durableObjectServiceClient";
import { isReviewPending } from "@vibestudio/shared/authority/reviewPending";
import { forkConversation, type ForkLocus } from "@workspace/channel-fork";
import type { ForkProjection, MessageBlockInput } from "@workspace/agentic-protocol";
import { readChannelSubscriptionRecords, type PubSubClient } from "@workspace/pubsub";
import type { ChatMessage } from "../../derived-types.js";
import type { ConnectionConfig } from "../../types.js";
import { StateCell, errorMessage, shallowEqual, type ReadableStore } from "../store.js";
import type {
  ChannelProvenance,
  ForkEntry,
  ForkNavHandlers,
  ForkTreeNode,
  ForkUiState,
} from "./types.js";

const CHANNEL_SERVICE_PROTOCOL = "vibestudio.channel.v1";
const FORK_HEAD_CHANGED_SIGNAL = "fork.head_changed";

export type ForkLineageRpc = Pick<ConnectionConfig["rpc"], "call" | "stream"> &
  Partial<Pick<ConnectionConfig["rpc"], "selfId">>;

/** Fixed identity of one lineage store. */
export interface ForkLineageIdentity {
  rpc: ForkLineageRpc;
  /** The conversation channel; `null` while the host has none yet. */
  channelId: string | null;
  contextId?: string;
}

/** Inputs that change over the store's lifetime. */
export interface ForkLineageInputs {
  /** Live channel connection. Only `onReconnect` is used: lineage owns its own
   *  response stream, and a recovered channel session resubscribes it. */
  client: Pick<PubSubClient, "onReconnect"> | null;
  selfId: string | null;
  /** The channel's initial replay settled; read cursors may advance. */
  replaySettled: boolean;
  /** Changes when a host review may have unblocked cursor persistence. */
  retrySignal?: number;
  /** Navigation + persistence handlers. Absent ⇒ lineage is disabled. */
  nav?: ForkNavHandlers;
}

interface ForkListResult {
  forks: ForkProjection[];
  headSeq: number;
}

interface LineageState {
  provenance?: ChannelProvenance;
  currentLabel: string;
  baseChildren: ForkEntry[];
  baseSiblings: ForkEntry[];
  currentHead: number;
  liveHeads: Record<string, number>;
  readCursors: Record<string, number>;
  forking: boolean;
  actionError?: string;
  loadError?: string;
  streamError?: string;
}

const EMPTY_ENTRIES: ForkEntry[] = [];

async function resolveChannelTarget(rpc: ForkLineageRpc, channelId: string): Promise<string> {
  const svc = await resolveDurableObjectService(rpc, CHANNEL_SERVICE_PROTOCOL, channelId);
  return svc.targetId ?? `do:${svc.source}:${svc.className}:${svc.objectKey}`;
}

async function readProvenance(rpc: ForkLineageRpc, channelId: string): Promise<ChannelProvenance> {
  return rpc.call(
    await resolveChannelTarget(rpc, channelId),
    channelClientRpcMethods["getProvenance"],
    []
  );
}

async function readForks(rpc: ForkLineageRpc, channelId: string): Promise<ForkListResult> {
  return rpc.call(await resolveChannelTarget(rpc, channelId), channelClientRpcMethods["listForks"], []);
}

function forkProjectionToEntry(fork: ForkProjection): ForkEntry {
  return {
    forkId: fork.forkId,
    parentChannelId: fork.parentChannelId,
    channelId: fork.forkedChannelId,
    contextId: fork.forkedContextId,
    label: fork.label || fork.reason || "Fork",
    reason: fork.reason,
    actorName: fork.actor.displayName ?? fork.actor.id,
    actorId: fork.actor.participantId ?? fork.actor.id,
    forkPointId: fork.forkPointId,
    createdAtSeq: fork.createdAtSeq,
    headSeq: fork.headSeq,
    archived: fork.archived,
  };
}

function messageExcerpt(message: ChatMessage): string {
  const text = message.content.trim().replace(/\s+/g, " ");
  return text.length > 42 ? `${text.slice(0, 41)}…` : text || "message";
}

interface SubscriptionBinding {
  client: Pick<PubSubClient, "onReconnect">;
  rootId: string;
  selfId: string;
  offReconnect: () => void;
  active: AbortController | null;
}

export class ForkLineageStore implements ReadableStore<ForkUiState> {
  readonly #rpc: ForkLineageRpc;
  readonly #channelId: string | null;
  readonly #contextId: string | undefined;
  readonly #cell = new StateCell<LineageState>({
    currentLabel: "Main",
    baseChildren: EMPTY_ENTRIES,
    baseSiblings: EMPTY_ENTRIES,
    currentHead: 0,
    liveHeads: {},
    readCursors: {},
    forking: false,
  });
  #holders = 0;
  #inputs: ForkLineageInputs = { client: null, selfId: null, replaySettled: false };
  #live = false;
  /** Owns the loads of the current activation. */
  #lifetime = new AbortController();
  #loadKey: string | null = null;
  #load: AbortController | null = null;
  #markReadKey: string | null = null;
  #subscription: SubscriptionBinding | null = null;
  /** Forks already known; `null` until the first durable roster loads. */
  #seenForkIds: Set<string> | null = null;
  #derived: { state: LineageState; value: ForkUiState } | null = null;
  #decorated: {
    base: ForkEntry[];
    liveHeads: Record<string, number>;
    readCursors: Record<string, number>;
    value: ForkEntry[];
  }[] = [];
  readonly #actions: ForkUiState["actions"];

  constructor(identity: ForkLineageIdentity) {
    this.#rpc = identity.rpc;
    this.#channelId = identity.channelId;
    this.#contextId = identity.contextId;
    this.#actions = {
      forkFromMessage: this.forkFromMessage,
      editAndForkMessage: this.editAndForkMessage,
      newFork: this.newFork,
      renameFork: this.renameFork,
      archiveFork: this.archiveFork,
      clearError: this.clearError,
      reportError: this.reportError,
      switchTo: this.switchTo,
      openInNewPanel: this.openInNewPanel,
      readForkCursors: this.readForkCursors,
      markForkRead: this.markForkRead,
      onExternalFork: this.notifyExternalFork,
      retryLiveUpdates: this.retryLiveUpdates,
    };
  }

  /**
   * Resubscribe the live lineage stream now (after it stopped). The channel
   * client's reconnect event does the same automatically.
   */
  readonly retryLiveUpdates = (): void => {
    const binding = this.#subscription;
    if (!binding) return;
    this.#mutate({ streamError: undefined });
    this.#openStream(binding);
  };

  readonly subscribe = (listener: () => void): (() => void) => this.#cell.subscribe(listener);

  readonly getSnapshot = (): ForkUiState => {
    const state = this.#cell.getSnapshot();
    if (this.#derived?.state === state) return this.#derived.value;
    const previous = this.#derived?.value;
    const children = this.#decorate(0, state.baseChildren, state);
    const siblings = this.#decorate(1, state.baseSiblings, state);
    const parent =
      previous && previous.provenance === state.provenance
        ? previous.parent
        : parentOf(state.provenance);
    const value: ForkUiState = {
      provenance: state.provenance,
      currentLabel: state.currentLabel,
      children,
      siblings,
      parent,
      forking: state.forking,
      error: state.actionError ?? state.loadError ?? state.streamError,
      liveUpdatesInterrupted: state.streamError !== undefined,
      refresh: this.refresh,
      loadTree: this.loadTree,
      actions: this.#actions,
    };
    this.#derived = { state, value };
    return value;
  };

  /**
   * Hold the store live. Live work (snapshot load, lineage stream, reconnect
   * listener) starts with the first holder and is released synchronously with
   * the last one; the reduced state survives, so a later holder resumes from
   * it. Lineage holds no connection of its own worth sharing across a
   * StrictMode remount, so release is immediate rather than turn-deferred.
   */
  retain(): () => void {
    this.#holders += 1;
    if (this.#holders === 1) {
      this.#live = true;
      this.#lifetime = new AbortController();
      this.#cell.transaction(() => this.#reconcile());
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#holders -= 1;
      if (this.#holders === 0) this.#stop();
    };
  }

  /** Apply the inputs that change over time, then reconcile. */
  setInputs(inputs: ForkLineageInputs): void {
    const current = this.#inputs;
    if (
      current.client === inputs.client &&
      current.selfId === inputs.selfId &&
      current.replaySettled === inputs.replaySettled &&
      current.retrySignal === inputs.retrySignal &&
      current.nav === inputs.nav
    )
      return;
    this.#inputs = inputs;
    this.#cell.transaction(() => this.#reconcile());
  }

  // --- actions ---------------------------------------------------------------

  readonly reportError = (summary: string, cause: unknown): void => {
    this.#mutate({ actionError: `${summary}: ${errorMessage(cause)}` });
  };

  readonly clearError = (): void => {
    this.#mutate({ actionError: undefined, loadError: undefined, streamError: undefined });
  };

  readonly refresh = (): void => {
    void this.#refreshData();
  };

  readonly markForkRead = async (readChannelId: string, headSeq: number): Promise<void> => {
    if (headSeq <= 0) return;
    const prior =
      this.#inputs.nav?.readForkCursors?.()[readChannelId] ??
      this.#cell.getSnapshot().readCursors[readChannelId] ??
      0;
    if (prior >= headSeq) return;
    try {
      await this.#inputs.nav?.markForkRead?.(readChannelId, headSeq);
    } catch (cause) {
      // A workspace review temporarily holds gated state writes. It is not a
      // persistence failure: leave the cursor stale so the review-resolution
      // retry (`retrySignal`) can write the same monotone head later.
      if (isReviewPending(cause)) return;
      throw cause;
    }
    this.#mutate((state) => ({
      readCursors: {
        ...state.readCursors,
        [readChannelId]: Math.max(state.readCursors[readChannelId] ?? 0, headSeq),
      },
    }));
  };

  readonly readForkCursors = (): Record<string, number> =>
    this.#inputs.nav?.readForkCursors?.() ?? {};

  readonly notifyExternalFork: NonNullable<ForkNavHandlers["onExternalFork"]> = (fork) =>
    this.#inputs.nav?.onExternalFork?.(fork);

  readonly switchTo = async (targetChannelId: string, targetContextId: string): Promise<void> => {
    try {
      await this.#inputs.nav?.switchTo(targetChannelId, targetContextId);
    } catch (cause) {
      this.#mutate({ actionError: `Could not switch conversations: ${errorMessage(cause)}` });
      throw cause;
    }
  };

  readonly openInNewPanel = async (targetChannelId: string, targetContextId: string): Promise<void> => {
    try {
      await this.#inputs.nav?.openInNewPanel(targetChannelId, targetContextId);
    } catch (cause) {
      this.#mutate({ actionError: `Could not open conversation: ${errorMessage(cause)}` });
      throw cause;
    }
  };

  readonly forkFromMessage = (message: ChatMessage): Promise<void> =>
    this.#runFork({
      locus: { kind: "after-message", messageId: message.id },
      reason: "fork",
      label: `After “${messageExcerpt(message)}”`,
    });

  readonly editAndForkMessage = (message: ChatMessage, newText: string): Promise<void> =>
    this.#runFork({
      locus: { kind: "before-message", messageId: message.id },
      reason: "edit",
      label: `Edited “${messageExcerpt(message)}”`,
      seedText: newText,
      replacesMessageId: message.id,
    });

  readonly newFork = (): Promise<void> =>
    this.#runFork({ locus: { kind: "head" }, reason: "fork", label: "New direction" });

  readonly renameFork = (entry: ForkEntry, label: string): Promise<void> =>
    this.#mutateFork(entry, "renameFork", [entry.forkId, label]);

  readonly archiveFork = (entry: ForkEntry): Promise<void> =>
    this.#mutateFork(entry, "archiveFork", [entry.forkId]);

  readonly loadTree = async (): Promise<ForkTreeNode[]> => {
    try {
      this.#mutate({ actionError: undefined });
      return await this.#loadTreeData();
    } catch (cause) {
      this.#mutate({ actionError: `Could not load conversation tree: ${errorMessage(cause)}` });
      return [];
    }
  };

  // --- pipeline --------------------------------------------------------------

  /** One state step: reduce, react (reconcile), then a single notification. */
  #mutate(patch: Partial<LineageState> | ((state: LineageState) => Partial<LineageState>)): void {
    this.#cell.transaction(() => {
      this.#cell.update(patch);
      this.#reconcile();
    });
  }

  #reconcile(): void {
    if (!this.#live) return;
    const inputs = this.#inputs;
    const state = this.#cell.getSnapshot();
    const enabled = Boolean(inputs.nav);
    const channelId = this.#channelId;

    // Durable snapshot load: once per (enabled, connected) transition.
    const loadKey = `${enabled}|${inputs.client !== null}`;
    if (loadKey !== this.#loadKey) {
      this.#loadKey = loadKey;
      this.#load?.abort();
      this.#load = null;
      if (enabled && !channelId) {
        this.#cell.update({
          provenance: undefined,
          baseChildren: EMPTY_ENTRIES,
          baseSiblings: EMPTY_ENTRIES,
        });
      } else if (enabled && inputs.client) {
        const load = new AbortController();
        this.#load = load;
        void this.#refreshData(load.signal);
      }
    }

    // Read position: advance to the durable head once replay settled, and
    // again whenever the host signals that persistence may be unblocked.
    const markReadKey =
      enabled && inputs.replaySettled && channelId && state.currentHead > 0
        ? `${state.currentHead}|${inputs.retrySignal ?? ""}`
        : null;
    if (markReadKey !== this.#markReadKey) {
      this.#markReadKey = markReadKey;
      if (markReadKey !== null && channelId) {
        void this.markForkRead(channelId, state.currentHead).catch((cause) =>
          this.reportError("Could not save the conversation read position", cause)
        );
      }
    }

    // Live lineage invalidations, scoped to the lineage root.
    const rootId =
      !channelId || !state.provenance
        ? null
        : state.provenance.kind === "fork"
          ? state.provenance.rootChannelId
          : channelId;
    const wanted =
      enabled && rootId && inputs.selfId && typeof this.#rpc.stream === "function" && inputs.client
        ? { client: inputs.client, rootId, selfId: inputs.selfId }
        : null;
    const bound = this.#subscription;
    if (
      !bound ||
      !wanted ||
      bound.client !== wanted.client ||
      bound.rootId !== wanted.rootId ||
      bound.selfId !== wanted.selfId
    ) {
      if (bound || wanted) {
        this.#unbindSubscription();
        if (wanted) this.#bindSubscription(wanted);
      }
    }
  }

  #stop(): void {
    this.#live = false;
    this.#lifetime.abort(new Error("Fork lineage released"));
    this.#loadKey = null;
    this.#load?.abort();
    this.#load = null;
    this.#unbindSubscription();
  }

  #bindSubscription(wanted: {
    client: Pick<PubSubClient, "onReconnect">;
    rootId: string;
    selfId: string;
  }): void {
    const binding: SubscriptionBinding = {
      ...wanted,
      offReconnect: () => undefined,
      active: null,
    };
    // The channel's recovered-session signal is the only resubscribe trigger;
    // a separate retry timer would compete with the transport's recovery.
    binding.offReconnect = wanted.client.onReconnect(() => this.#openStream(binding));
    this.#subscription = binding;
    this.#openStream(binding);
  }

  #unbindSubscription(): void {
    const binding = this.#subscription;
    if (!binding) return;
    this.#subscription = null;
    binding.offReconnect();
    binding.active?.abort();
    binding.active = null;
  }

  #openStream(binding: SubscriptionBinding): void {
    if (this.#subscription !== binding) return;
    binding.active?.abort();
    const abort = new AbortController();
    binding.active = abort;
    const rpc = this.#rpc;
    void (async () => {
      try {
        const target = await resolveChannelTarget(rpc, binding.rootId);
        if (abort.signal.aborted) return;
        const response = await rpc.stream!(
          target,
          channelClientRpcMethods.subscribeLineage,
          [binding.selfId],
          { signal: abort.signal, bodyIdleTimeoutMs: null }
        );
        if (abort.signal.aborted) {
          await response.body?.cancel();
          return;
        }
        for await (const record of readChannelSubscriptionRecords(response)) {
          if (abort.signal.aborted) return;
          if (record.kind === "subscribed") {
            // Re-read durable heads only after the live subscription is ready,
            // so changes during reconnect cannot fall between the two reads.
            await this.#refreshData(abort.signal);
            if (!abort.signal.aborted) this.#mutate({ streamError: undefined });
            continue;
          }
          const signal = record.payload as {
            kind?: unknown;
            payload?: { contentType?: unknown; content?: unknown };
          };
          if (signal.kind !== "signal" || signal.payload?.contentType !== FORK_HEAD_CHANGED_SIGNAL)
            continue;
          const parsed = JSON.parse(String(signal.payload.content)) as {
            channelId?: unknown;
            headSeq?: unknown;
            rosterChanged?: unknown;
          };
          if (typeof parsed.channelId !== "string" || typeof parsed.headSeq !== "number") continue;
          const headChannel = parsed.channelId;
          const headSeq = parsed.headSeq;
          this.#mutate((state) => ({
            liveHeads: {
              ...state.liveHeads,
              [headChannel]: Math.max(state.liveHeads[headChannel] ?? 0, headSeq),
            },
          }));
          if (headChannel === this.#channelId) {
            void this.markForkRead(headChannel, headSeq).catch((cause) =>
              this.reportError("Could not save the conversation read position", cause)
            );
            if (parsed.rosterChanged === true) void this.#refreshData(abort.signal);
          }
        }
      } catch (cause) {
        if (!abort.signal.aborted) {
          console.warn("[ForkLineageStore] live fork updates stopped:", cause);
          this.#mutate({
            streamError:
              "Fork updates paused: new forks and unread badges won't refresh until you retry.",
          });
        }
      }
    })();
  }

  async #refreshData(signal?: AbortSignal): Promise<void> {
    const channelId = this.#channelId;
    if (!this.#inputs.nav || !channelId) return;
    const owner = signal ?? this.#lifetime.signal;
    const rpc = this.#rpc;
    try {
      const [provenance, own] = await Promise.all([
        readProvenance(rpc, channelId),
        readForks(rpc, channelId),
      ]);
      let siblings: ForkEntry[] = [];
      let label =
        provenance.kind === "task" ? "Subagent task" : provenance.kind === "fork" ? "Fork" : "Main";
      if (provenance.kind === "fork") {
        const parent = await readForks(rpc, provenance.forkedFrom);
        const self = parent.forks.find((fork) => fork.forkedChannelId === channelId);
        if (self) label = self.label || self.reason || "Fork";
        siblings = parent.forks
          .filter((fork) => fork.forkedChannelId !== channelId && !fork.archived)
          .map(forkProjectionToEntry);
      }
      if (owner.aborted) return;
      const children = own.forks.filter((fork) => !fork.archived).map(forkProjectionToEntry);
      // A re-read that finds nothing new keeps every existing identity, so a
      // reconnect or resubscribe does not wake the lineage surfaces.
      const state = this.#cell.getSnapshot();
      const readCursors = this.#inputs.nav?.readForkCursors?.() ?? {};
      this.#mutate({
        loadError: undefined,
        provenance: sameJson(state.provenance, provenance) ? state.provenance : provenance,
        currentLabel: label,
        currentHead: own.headSeq,
        baseChildren: sameJson(state.baseChildren, children) ? state.baseChildren : children,
        baseSiblings: sameJson(state.baseSiblings, siblings) ? state.baseSiblings : siblings,
        readCursors: shallowEqual(state.readCursors, readCursors) ? state.readCursors : readCursors,
      });
      this.#noticeExternalForks(children);
    } catch (cause) {
      if (!owner.aborted)
        this.#mutate({ loadError: `Could not load conversation forks: ${errorMessage(cause)}` });
    }
  }

  /**
   * Hand newly materialized forks that the local participant did not create
   * to the host. The first durable roster is the baseline: forks that existed
   * before this surface loaded are not news.
   */
  #noticeExternalForks(children: ForkEntry[]): void {
    if (this.#seenForkIds === null) {
      this.#seenForkIds = new Set(children.map((entry) => entry.forkId));
      return;
    }
    for (const entry of children) {
      if (this.#seenForkIds.has(entry.forkId)) continue;
      this.#seenForkIds.add(entry.forkId);
      const selfId = this.#inputs.selfId;
      if (selfId !== null && entry.actorId === selfId) continue;
      void (async () => {
        try {
          await this.#inputs.nav?.onExternalFork?.({
            forkedChannelId: entry.channelId,
            forkedContextId: entry.contextId,
            actorName: entry.actorName,
            forkPointId: entry.forkPointId,
          });
        } catch (cause) {
          this.reportError("Could not notify about a new conversation fork", cause);
        }
      })();
    }
  }

  async #runFork(options: {
    locus: ForkLocus;
    reason: string;
    label: string;
    seedText?: string;
    replacesMessageId?: string;
  }): Promise<void> {
    const channelId = this.#channelId;
    const nav = this.#inputs.nav;
    if (!nav || !channelId) return;
    this.#mutate({ forking: true, actionError: undefined });
    try {
      const seed = options.seedText
        ? {
            blocks: [
              {
                blockId: `fork-seed:${crypto.randomUUID()}` as never,
                type: "text" as const,
                content: options.seedText,
              },
            ] as MessageBlockInput[],
            ...(options.replacesMessageId
              ? { replaces: { messageId: options.replacesMessageId } }
              : {}),
          }
        : undefined;
      const result = await forkConversation(this.#rpc, {
        channelId,
        locus: options.locus,
        reason: options.reason,
        label: options.label,
        ...(seed ? { seed } : {}),
      });
      await (this.#inputs.nav ?? nav).switchTo(result.forkedChannelId, result.forkedContextId);
    } catch (cause) {
      this.#mutate({ actionError: `Could not create fork: ${errorMessage(cause)}` });
      throw cause;
    } finally {
      this.#mutate({ forking: false });
    }
  }

  async #mutateFork<K extends "renameFork" | "archiveFork">(
    entry: ForkEntry,
    method: K,
    args: RpcMethodArgs<(typeof channelClientRpcMethods)[K]>
  ): Promise<void> {
    try {
      this.#mutate({ actionError: undefined });
      const target = await resolveChannelTarget(this.#rpc, entry.parentChannelId);
      await createRpcMethodCaller(this.#rpc, target, channelClientRpcMethods)(method, args);
      await this.#refreshData();
    } catch (cause) {
      this.#mutate({ actionError: `Could not update fork: ${errorMessage(cause)}` });
      throw cause;
    }
  }

  async #loadTreeData(): Promise<ForkTreeNode[]> {
    const channelId = this.#channelId;
    if (!this.#inputs.nav || !channelId) return [];
    const rpc = this.#rpc;
    const contextByChannel = new Map<string, string | undefined>([[channelId, this.#contextId]]);
    let rootChannelId = channelId;
    let cursor = channelId;
    const ancestrySeen = new Set<string>();
    while (!ancestrySeen.has(cursor)) {
      ancestrySeen.add(cursor);
      const cursorProvenance = await readProvenance(rpc, cursor);
      if (cursorProvenance.kind === "fork") {
        rootChannelId = cursorProvenance.rootChannelId;
        contextByChannel.set(cursorProvenance.forkedFrom, cursorProvenance.parentContextId);
        cursor = cursorProvenance.forkedFrom;
        continue;
      }
      if (cursorProvenance.kind === "task") {
        contextByChannel.set(cursorProvenance.parentChannelId, cursorProvenance.parentContextId);
        cursor = cursorProvenance.parentChannelId;
        rootChannelId = cursor;
        continue;
      }
      rootChannelId = cursor;
      break;
    }
    const seen = new Set<string>();
    const build = async (
      nodeChannelId: string,
      nodeContextId: string | undefined,
      label: string,
      provenanceKind: "root" | "fork" | "task"
    ): Promise<ForkTreeNode> => {
      if (seen.has(nodeChannelId)) {
        return {
          channelId: nodeChannelId,
          contextId: nodeContextId,
          label,
          provenanceKind,
          isCurrent: nodeChannelId === channelId,
          headSeq: 0,
          children: [],
        };
      }
      seen.add(nodeChannelId);
      const listed = await readForks(rpc, nodeChannelId);
      const childNodes = await Promise.all(
        listed.forks
          .filter((fork) => !fork.archived)
          .map((fork) => {
            contextByChannel.set(fork.forkedChannelId, fork.forkedContextId);
            return build(fork.forkedChannelId, fork.forkedContextId, fork.label, "fork");
          })
      );
      const { liveHeads, readCursors } = this.#cell.getSnapshot();
      const headSeq = Math.max(liveHeads[nodeChannelId] ?? 0, listed.headSeq);
      return {
        channelId: nodeChannelId,
        contextId: nodeContextId,
        label,
        provenanceKind,
        isCurrent: nodeChannelId === channelId,
        headSeq,
        unread: nodeChannelId !== channelId && headSeq > (readCursors[nodeChannelId] ?? 0),
        children: childNodes,
      };
    };
    return [await build(rootChannelId, contextByChannel.get(rootChannelId), "Main", "root")];
  }

  /** Decorate entries with live heads and unread badges, memoized per list. */
  #decorate(slot: number, base: ForkEntry[], state: LineageState): ForkEntry[] {
    const cached = this.#decorated[slot];
    if (
      cached &&
      cached.base === base &&
      cached.liveHeads === state.liveHeads &&
      cached.readCursors === state.readCursors
    )
      return cached.value;
    const value =
      base.length === 0
        ? EMPTY_ENTRIES
        : base.map((entry) => {
            const headSeq = Math.max(entry.headSeq, state.liveHeads[entry.channelId] ?? 0);
            return {
              ...entry,
              headSeq,
              unread: headSeq > (state.readCursors[entry.channelId] ?? 0),
            };
          });
    this.#decorated[slot] = {
      base,
      liveHeads: state.liveHeads,
      readCursors: state.readCursors,
      value,
    };
    return value;
  }
}

function sameJson(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function parentOf(provenance: ChannelProvenance | undefined): ForkUiState["parent"] {
  if (provenance?.kind === "fork")
    return { channelId: provenance.forkedFrom, contextId: provenance.parentContextId };
  if (provenance?.kind === "task")
    return { channelId: provenance.parentChannelId, contextId: provenance.parentContextId };
  return undefined;
}
