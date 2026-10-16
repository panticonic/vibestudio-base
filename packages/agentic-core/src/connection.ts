/** Headless PubSub connection and its owned replay/event delivery lifecycle. */
import { connectViaRpc, resolveRpcChannelTarget } from "@workspace/pubsub";
import type {
  PubSubClient,
  RosterUpdate,
  EventStreamItem,
  MethodDefinition,
  ChannelConfig,
} from "@workspace/pubsub";
import { isRpcAbortedBy } from "@vibestudio/rpc";
import type { ChatParticipantMetadata, ConnectionConfig } from "./types.js";
import {
  DEFAULT_CHANNEL_ENVELOPE_PAGE_LIMIT,
  MAX_CHANNEL_ENVELOPE_PAGE_LIMIT,
} from "@vibestudio/shared/channelEnvelopePaging";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";
/** Human clients supply a display label, not an asserted account identity. */
export type ClientParticipantMetadata = Partial<ChatParticipantMetadata> &
  Pick<ChatParticipantMetadata, "name" | "type">;
export interface ConnectionCallbacks {
  /** Delivery belongs to this connection; asynchronous handlers must honor its signal. */
  onEvent?: (
    event: EventStreamItem,
    signal: AbortSignal,
  ) => void | Promise<void>;
  onRoster?: (roster: RosterUpdate<ChatParticipantMetadata>) => void;
  onError?: (error: Error) => void;
  onReconnect?: () => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}
export interface ConnectionConnectOptions {
  signal?: AbortSignal;
  channelId: string;
  channelTargetId?: string;
  methods: Record<string, MethodDefinition>;
  channelConfig?: ChannelConfig;
  contextId?: string;
}
interface ConnectionScope {
  abort: AbortController;
  client: PubSubClient<ChatParticipantMetadata> | null;
  unsubscribers: Array<() => void>;
  iterator: AsyncIterableIterator<EventStreamItem> | null;
  eventLoop: Promise<void> | null;
  closing: Promise<void> | null;
  failures: unknown[];
  /** The connecting caller owns this result, separately from retirement. */
  connectionFailure: { reason: unknown } | null;
}
function throwFailures(failures: unknown[], message: string): void {
  const unique = new Set<unknown>();
  const collect = (failure: unknown): void => {
    if (failure instanceof AggregateError) {
      for (const cause of failure.errors) collect(cause);
    } else unique.add(failure);
  };
  failures.forEach(collect);
  if (unique.size === 1) throw unique.values().next().value;
  if (unique.size > 1) throw new AggregateError(unique, message);
}
const asError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

export class ConnectionManager {
  private _client: PubSubClient<ChatParticipantMetadata> | null = null;
  private _status: ConnectionStatus = "disconnected";
  private _clientId: string | null = null;
  private scope: ConnectionScope | null = null;
  private connectTask: Promise<PubSubClient<ChatParticipantMetadata>> | null =
    null;
  private disconnectPromise: Promise<void> | null = null;
  private config: ConnectionConfig;
  private metadata: ClientParticipantMetadata;
  private callbacks: ConnectionCallbacks;
  constructor(opts: {
    config: ConnectionConfig;
    metadata: ClientParticipantMetadata;
    callbacks: ConnectionCallbacks;
  }) {
    this.config = opts.config;
    this.metadata = opts.metadata;
    this.callbacks = opts.callbacks;
  }
  get client(): PubSubClient<ChatParticipantMetadata> | null {
    return this._client;
  }
  get status(): ConnectionStatus {
    return this._status;
  }
  get connected(): boolean {
    return this._status === "connected";
  }
  get clientId(): string | null {
    return this._clientId;
  }
  async connect(
    options: ConnectionConnectOptions,
  ): Promise<PubSubClient<ChatParticipantMetadata>> {
    options.signal?.throwIfAborted();
    const task = this.connectOwned(options);
    this.connectTask = task;
    const retire = () => {
      if (this.connectTask === task) this.connectTask = null;
    };
    void task.then(retire, retire);
    return task;
  }
  private async connectOwned(
    options: ConnectionConnectOptions,
  ): Promise<PubSubClient<ChatParticipantMetadata>> {
    const closing = this.disconnect();
    const scope: ConnectionScope = {
      abort: new AbortController(),
      client: null,
      unsubscribers: [],
      iterator: null,
      eventLoop: null,
      closing: null,
      failures: [],
      connectionFailure: null,
    };
    this.scope = scope;
    const signal = scope.abort.signal;
    const onAbort = () => {
      scope.abort.abort(options.signal!.reason);
      if (this.scope === scope) {
        this.setStatus("disconnected", scope.failures);
        if (this._client)
          void this.disconnect().catch((error) => {
            try {
              this.callbacks.onError?.(asError(error));
            } catch (observerError) {
              console.error(
                "[ConnectionManager] retirement observer failed",
                new AggregateError(
                  [error, observerError],
                  "Connection retirement and observation failed",
                ),
              );
            }
          });
      }
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    scope.unsubscribers.push(() =>
      options.signal?.removeEventListener("abort", onAbort),
    );
    if (options.signal?.aborted) onAbort();
    try {
      await closing;
      signal.throwIfAborted();
      if (!this.config.rpc)
        throw new Error("PubSub RPC configuration not available");
      this.setStatus("connecting");
      const replayMessageLimit = Math.min(
        this.config.replayMessageLimit ?? DEFAULT_CHANNEL_ENVELOPE_PAGE_LIMIT,
        MAX_CHANNEL_ENVELOPE_PAGE_LIMIT,
      );
      const channelTargetId =
        options.channelTargetId ??
        (await resolveRpcChannelTarget({
          rpc: this.config.rpc,
          reviewRpc: this.config.rpc,
          channel: options.channelId,
          protocol: this.config.protocol,
          ...(options.contextId ? { contextId: options.contextId } : {}),
          signal,
        }));
      signal.throwIfAborted();
      const client = connectViaRpc<ChatParticipantMetadata>({
        rpc: this.config.rpc,
        channel: options.channelId,
        channelTargetId,
        contextId: options.contextId,
        channelConfig: options.channelConfig,
        ...(this.metadata.handle !== undefined
          ? { handle: this.metadata.handle }
          : {}),
        name: this.metadata.name,
        type: this.metadata.type,
        clientId: this.config.clientId,
        protocol: this.config.protocol,
        metadata: this.metadata as ChatParticipantMetadata,
        methods: options.methods,
        replayMode: "stream",
        replayMessageLimit,
        deliveryMode: this.config.deliveryMode,
        ...(this.config.deliveryMode === "resident" && this.callbacks.onEvent
          ? {
              residentEventHandler: (event: EventStreamItem) =>
                this.callbacks.onEvent!(event, signal),
            }
          : {}),
        recoveryCoordinator: this.config.recoveryCoordinator,
      });
      scope.client = client;
      await client.ready(signal);
      signal.throwIfAborted();
      if (options.contextId && client.contextId !== options.contextId) {
        throw new Error(
          "Channel " +
            options.channelId +
            " resolved in context " +
            (client.contextId ?? "none") +
            ", expected " +
            options.contextId,
        );
      }
      if (this.config.deliveryMode !== "resident") {
        const iterator = client.events({
          includeReplay: true,
          includeSignals: true,
          signal,
        });
        scope.iterator = iterator;
        let resolveReplay!: () => void;
        let rejectReplay!: (cause: unknown) => void;
        const replayDelivered = new Promise<void>((resolve, reject) => {
          resolveReplay = resolve;
          rejectReplay = reject;
        });
        scope.eventLoop = (async () => {
          try {
            for (;;) {
              signal.throwIfAborted();
              const next = await iterator.next();
              signal.throwIfAborted();
              if (next.done) throw new Error("Channel event stream ended");
              await this.callbacks.onEvent?.(next.value, signal);
              signal.throwIfAborted();
              if (next.value.type === "replay-complete") resolveReplay();
            }
          } catch (error) {
            rejectReplay(error);
            throw error;
          }
        })();
        // Observe immediately, retaining exact completion for retirement.
        // Until readiness the connecting caller owns failure reporting.
        void scope.eventLoop.catch((error) => {
          if (
            this._client === client &&
            !isRpcAbortedBy(error, signal.reason)
          ) {
            scope.failures.push(error);
            scope.abort.abort(error);
            this.setStatus("error", scope.failures);
            try {
              this.callbacks.onError?.(asError(error));
            } catch (observerError) {
              scope.failures.push(observerError);
            }
            void this.disconnect().catch((failure) =>
              console.error(
                "[ConnectionManager] event reader retirement failed",
                failure,
              ),
            );
          }
        });
        await replayDelivered;
      }
      signal.throwIfAborted();
      console.info("[ConnectionManager] channel replay connected", {
        channelId: options.channelId,
        requestedContextId: options.contextId ?? null,
        resolvedContextId: client.contextId ?? null,
        replayMessageLimit,
        totalMessageCount: client.totalMessageCount ?? null,
        envelopeCount: client.envelopeCount ?? null,
        firstEnvelopeSeq: client.firstEnvelopeSeq ?? null,
        hasMoreBefore: client.hasMoreBefore ?? null,
      });
      scope.unsubscribers.push(
        client.onRoster((roster) => this.callbacks.onRoster?.(roster)),
      );
      scope.unsubscribers.push(
        client.onReconnect(() => this.callbacks.onReconnect?.()),
      );
      this._client = client;
      this._clientId = client.clientId ?? null;
      this.setStatus("connected");
      return client;
    } catch (error) {
      const ownedCancellation = isRpcAbortedBy(error, signal.reason);
      scope.connectionFailure = { reason: error };
      scope.abort.abort(error);
      if (this.scope === scope) {
        this._client = null;
        this._clientId = null;
        if (!ownedCancellation) {
          try {
            this.callbacks.onError?.(asError(error));
          } catch (observerError) {
            scope.failures.push(observerError);
          }
        }
        this.setStatus("disconnected", scope.failures);
      }
      const failures = [error];
      try {
        await this.closeScope(scope);
      } catch (cleanupError) {
        failures.push(cleanupError);
      }
      if (this.scope === scope) this.scope = null;
      throwFailures(failures, "Channel connection and retirement failed");
      throw error;
    }
  }
  private closeScope(scope: ConnectionScope): Promise<void> {
    if (scope.closing) return scope.closing;
    scope.abort.abort(new Error("Connection disconnected"));
    // Stop admission, then join every admitted cleanup and active callback.
    const tasks = [
      ...scope.unsubscribers
        .splice(0)
        .map((unsubscribe) => Promise.resolve().then(unsubscribe)),
      Promise.resolve().then(() => scope.iterator?.return?.()),
      scope.eventLoop,
      Promise.resolve().then(() => scope.client?.close()),
    ];
    scope.closing = Promise.allSettled(tasks).then((results) => {
      throwFailures(
        [
          ...scope.failures,
          ...results.flatMap((result) =>
            result.status === "rejected" &&
            !(
              scope.connectionFailure &&
              result.reason === scope.connectionFailure.reason
            ) &&
            !isRpcAbortedBy(result.reason, scope.abort.signal.reason)
              ? [result.reason]
              : [],
          ),
        ],
        "Channel retirement failed",
      );
    });
    return scope.closing;
  }
  disconnect(): Promise<void> {
    const scope = this.scope;
    this.scope = null;
    const connecting = this.connectTask;
    this.connectTask = null;
    const previous = this.disconnectPromise;
    if (!scope && !connecting) return previous ?? Promise.resolve();
    const retiring = scope ? this.closeScope(scope) : null;
    const ownedReason = scope?.abort.signal.reason;
    this._client = null;
    this._clientId = null;
    const failures = scope?.failures ?? [];
    this.setStatus("disconnected", failures);
    const closing = Promise.allSettled([previous, retiring, connecting]).then(
      (results) => {
        throwFailures(
          [
            ...failures,
            // The attempt's caller receives its primary result. Joining it
            // establishes retirement, not a second delivery of that failure
            // to an unrelated successor; closeScope retains cleanup failures.
            ...results
              .slice(0, 2)
              .flatMap((result) =>
                result.status === "rejected" &&
                !isRpcAbortedBy(result.reason, ownedReason)
                  ? [result.reason]
                  : [],
              ),
          ],
          "Channel disconnect failed",
        );
      },
    );
    const tracked = closing.finally(() => {
      if (this.disconnectPromise === tracked) this.disconnectPromise = null;
    });
    this.disconnectPromise = tracked;
    return tracked;
  }
  private setStatus(status: ConnectionStatus, failures?: unknown[]): void {
    this._status = status;
    try {
      this.callbacks.onStatusChange?.(status);
    } catch (observerError) {
      if (failures) failures.push(observerError);
      else throw observerError;
    }
  }
}
