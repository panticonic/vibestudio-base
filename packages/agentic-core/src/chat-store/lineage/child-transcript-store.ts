/**
 * ChildTranscriptStore — observe another channel's real transcript (a
 * subagent's task channel, or a foreign channel holding an envelope) through
 * the parent surface's own transport configuration.
 *
 * One observer connection per instance, owned by a reference count so every
 * view of the same card (collapsed activity + expanded transcript) and a
 * StrictMode remount share it. Every connection ATTEMPT uses a distinct client
 * id: a retry or a superseded attempt must never let an older asynchronous
 * disconnect tear down the newer observer with the same registry identity.
 */

import type { Participant } from "@workspace/pubsub";
import { ConnectionManager, type ClientParticipantMetadata } from "../../connection.js";
import type { ChatMessage } from "../../derived-types.js";
import type { ChatParticipantMetadata, ConnectionConfig } from "../../types.js";
import { ChannelViewFeed, type ChannelViewFeedSnapshot } from "../channel-view-feed.js";
import { RetainCount, StateCell, errorMessage, type ReadableStore } from "../store.js";

/** Transport material reused from the parent surface's own connection. */
export interface ChildTranscriptConnection {
  config: ConnectionConfig;
  metadata: ClientParticipantMetadata;
}

export interface ChildTranscriptTarget {
  connection: ChildTranscriptConnection;
  channelId: string;
  /** The channel's own context, when known; a foreign channel resolves its own. */
  contextId: string | null;
}

export interface ChildTranscriptSnapshot {
  messages: ChatMessage[];
  participants: Record<string, Participant<ChatParticipantMetadata>>;
  /** The observer's participant id once connected. */
  selfId: string | null;
  /** True until the child's history has replayed. */
  loading: boolean;
  error: string | null;
  hasMoreHistory: boolean;
  loadingMore: boolean;
}

interface ObserverState {
  participants: Record<string, Participant<ChatParticipantMetadata>>;
  selfId: string | null;
  connecting: boolean;
  error: string | null;
}

let nextObserverGeneration = 0;

function observerClientId(base: string, channelId: string): string {
  nextObserverGeneration += 1;
  return `${base}:observe:${channelId}:${nextObserverGeneration}`;
}

export class ChildTranscriptStore implements ReadableStore<ChildTranscriptSnapshot> {
  readonly #target: ChildTranscriptTarget;
  readonly #feed: ChannelViewFeed;
  readonly #cell = new StateCell<ObserverState>({
    participants: {},
    selfId: null,
    connecting: false,
    error: null,
  });
  readonly #retained: RetainCount;
  #attempt: { manager: ConnectionManager; cancelled: boolean } | null = null;
  #derived: {
    state: ObserverState;
    feed: ChannelViewFeedSnapshot;
    value: ChildTranscriptSnapshot;
  } | null = null;

  constructor(target: ChildTranscriptTarget) {
    this.#target = target;
    this.#feed = new ChannelViewFeed({ channelId: target.channelId });
    this.#retained = new RetainCount({
      start: () => this.#connect(),
      dispose: () => {
        this.#detach();
        this.#feed.dispose();
      },
    });
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    const offState = this.#cell.subscribe(listener);
    const offFeed = this.#feed.subscribe(listener);
    return () => {
      offState();
      offFeed();
    };
  };

  readonly getSnapshot = (): ChildTranscriptSnapshot => {
    const state = this.#cell.getSnapshot();
    const feed = this.#feed.getSnapshot();
    const cached = this.#derived;
    if (cached && cached.state === state && cached.feed === feed) return cached.value;
    const value: ChildTranscriptSnapshot = {
      messages: feed.messages,
      participants: state.participants,
      selfId: state.selfId,
      loading: state.connecting || !feed.replaySettled,
      error: state.error,
      hasMoreHistory: feed.hasMoreHistory,
      loadingMore: feed.loadingMore,
    };
    this.#derived = { state, feed, value };
    return value;
  };

  /** Hold the observer; it connects on the first holder. */
  retain(): () => void {
    return this.#retained.retain();
  }

  /** Release the observer immediately, regardless of holders. */
  dispose(): void {
    this.#retained.disposeNow();
  }

  /** Start a fresh observer generation (after a terminal connection failure). */
  readonly retry = (): void => {
    if (this.#retained.disposed) return;
    this.#connect();
  };

  readonly loadEarlierMessages = (): Promise<void> => this.#feed.loadEarlierMessages();

  #connect(): void {
    this.#detach();
    const { connection, channelId, contextId } = this.#target;
    const attempt: { manager: ConnectionManager; cancelled: boolean } = {
      cancelled: false,
      manager: new ConnectionManager({
        config: {
          ...connection.config,
          clientId: observerClientId(connection.config.clientId, channelId),
        },
        metadata: { ...connection.metadata, type: "panel" },
        callbacks: {
          onEvent: (event) => {
            if (!attempt.cancelled) this.#feed.ingest(event);
          },
          onRoster: (update) => {
            if (!attempt.cancelled) this.#cell.update({ participants: { ...update.participants } });
          },
          onError: (error) => {
            if (!attempt.cancelled) this.#cell.update({ error: error.message });
          },
          onReconnect: () => {
            if (!attempt.cancelled) this.#cell.update({ error: null });
          },
        },
      }),
    };
    this.#attempt = attempt;
    this.#feed.reset(channelId);
    this.#cell.update({ connecting: true, error: null, selfId: null });
    void attempt.manager
      .connect({ channelId, methods: {}, ...(contextId ? { contextId } : {}) })
      .then((client) => {
        if (attempt.cancelled) return;
        this.#cell.transaction(() => {
          this.#feed.attach(client);
          this.#cell.update({ selfId: client.clientId ?? null });
        });
      })
      .catch((error: unknown) => {
        if (!attempt.cancelled) this.#cell.update({ error: errorMessage(error) });
      })
      .finally(() => {
        if (!attempt.cancelled) this.#cell.update({ connecting: false });
      });
  }

  #detach(): void {
    const attempt = this.#attempt;
    if (!attempt) return;
    this.#attempt = null;
    attempt.cancelled = true;
    this.#cell.update({ participants: {}, selfId: null });
    void attempt.manager.disconnect().catch(() => {
      /* tearing down an observer connection is best-effort */
    });
  }
}
