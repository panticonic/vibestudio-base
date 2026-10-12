/**
 * ChannelViewFeed — the one reduction of a channel's event stream into the
 * transcript view model.
 *
 * Input is any ordered sequence of channel client events (`ingest`): the
 * events a `ConnectionManager` forwards (stream or resident delivery), or the
 * iterator of a raw client (`follow`). Durable trajectory envelopes and
 * credential-connect rows go through the canonical channel reducer; ephemeral
 * `message.delta` signals are applied straight to the message projection (the
 * durable terminal later replaces their blocks authoritatively).
 *
 * Presentation timing is product behaviour, owned here:
 *   - live durable events project immediately;
 *   - replayed events are batched and projected once at the replay boundary
 *     (the first live event, the ready marker via `attach`, or the end of the
 *     current macrotask);
 *   - streaming deltas are coalesced into one projection per ~frame.
 *
 * The derived `messages` window keeps the previous ChatMessage object whenever
 * a message is unchanged (`sameChatMessage`), so row components can bail out.
 */

import {
  iterateChannelReplayAfterPages,
  type Attachment,
  type IncomingEvent,
  type PubSubClient,
} from "@workspace/pubsub";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  CREDENTIAL_CONNECT_PAYLOAD_KIND,
  applyMessageEvent,
  createInitialChannelViewState,
  pubsubAgenticEventToEnvelope,
  pubsubChannelEventToEnvelope,
  reduceChannelView,
  type AgenticEvent,
  type ChannelViewState,
} from "@workspace/agentic-protocol";
import {
  actionBarPayloadFromChannelView,
  chatMessagesFromChannelView,
  messageTypeDefinitionsFromChannelView,
} from "../channel-chat-merge.js";
import type { ActionBarPayload, ChatMessage, MessageTypeDefinition } from "../derived-types.js";
import { StateCell, type ReadableStore } from "./store.js";

/** Maximum messages in the visible window. New messages push the oldest out. */
export const TRANSCRIPT_MAX_VISIBLE = 2000;
/** Envelopes requested per history page. */
export const TRANSCRIPT_PAGE_SIZE = 500;
/** Streaming deltas are projected at most once per this window (~30 Hz). */
export const DELTA_COALESCE_MS = 33;

export interface ChannelViewFeedSnapshot {
  /** The reduced channel view (turns, invocations, forks, credential requests, …). */
  view: ChannelViewState;
  /** Visible transcript window derived from `view`. */
  messages: ChatMessage[];
  actionBar: ActionBarPayload | null;
  messageTypes: MessageTypeDefinition[];
  /** Earlier durable history exists (server continuation or a trimmed window). */
  hasMoreHistory: boolean;
  loadingMore: boolean;
  /** An agent turn is open or waiting (blocked work that can be steered). */
  hasOpenTurn: boolean;
  /** The initial replay completed, so `messages` reflects prior history.
   *  Sourced from the client's ready marker, which fires even for an empty
   *  channel — never from socket connect. */
  replaySettled: boolean;
}

/** The channel client capabilities the feed uses for paging and readiness. */
export type ChannelFeedClient = Pick<
  PubSubClient,
  "channelId" | "connected" | "hasMoreBefore" | "onReady" | "getReplayBefore" | "getReplayAfter"
>;

/** The client capabilities `follow` additionally needs. */
export type FollowableChannelClient = ChannelFeedClient & Pick<PubSubClient, "events">;

const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_MESSAGE_TYPES: MessageTypeDefinition[] = [];

function initialSnapshot(): ChannelViewFeedSnapshot {
  return {
    view: createInitialChannelViewState(),
    messages: EMPTY_MESSAGES,
    actionBar: null,
    messageTypes: EMPTY_MESSAGE_TYPES,
    hasMoreHistory: false,
    loadingMore: false,
    hasOpenTurn: false,
    replaySettled: false,
  };
}

interface WireEvent {
  type?: string;
  delivery?: "log" | "signal";
  phase?: "replay" | "live";
  senderId?: string;
  pubsubId?: number;
  senderMetadata?: { name?: string; type?: string; handle?: string };
  ts?: number;
  attachments?: WireAttachment[];
  payload?: unknown;
  contentClass?: "internal" | "external";
  externalKeys?: string[];
  contentType?: string;
  content?: string;
}

interface ReplayLogEvent {
  id: number;
  type: string;
  senderId?: string;
  ts?: number;
  senderMetadata?: unknown;
  payload?: unknown;
  attachments?: unknown;
  contentClass?: "internal" | "external";
  externalKeys?: string[];
}

/** One subscription generation: paging and backfill belong to exactly one. */
interface Generation {
  readonly lifetime: AbortController;
  client: ChannelFeedClient | null;
  readyOff: (() => void) | null;
}

export interface ChannelViewFeedOptions {
  /** Channel id stamped on reduced envelopes until a client is attached. */
  channelId?: string;
  maxVisible?: number;
}

export class ChannelViewFeed implements ReadableStore<ChannelViewFeedSnapshot> {
  readonly #cell = new StateCell<ChannelViewFeedSnapshot>(initialSnapshot());
  readonly #maxVisible: number;
  #channelId: string;
  #generation: Generation;
  /** Latest reduced view. The snapshot's `view` advances with each projection. */
  #view: ChannelViewState = createInitialChannelViewState();
  #attachments = new Map<string, Attachment[]>();
  #oldestSeq: number | null = null;
  #newestSeq: number | null = null;
  #messageTypesSignature = "[]";
  #replayDirty = false;
  #replayTimer: ReturnType<typeof setTimeout> | null = null;
  #deltaTimer: ReturnType<typeof setTimeout> | null = null;
  #disposed = false;

  constructor(options: ChannelViewFeedOptions = {}) {
    this.#channelId = options.channelId ?? "";
    this.#maxVisible = options.maxVisible ?? TRANSCRIPT_MAX_VISIBLE;
    this.#generation = { lifetime: new AbortController(), client: null, readyOff: null };
  }

  readonly getSnapshot = (): ChannelViewFeedSnapshot => this.#cell.getSnapshot();
  readonly subscribe = (listener: () => void): (() => void) => this.#cell.subscribe(listener);

  /** The reduced channel view, current as of the last ingested event (the
   *  snapshot's `view` is the one the current `messages` were derived from). */
  get view(): ChannelViewState {
    return this.#view;
  }

  /**
   * Start a new subscription generation: drop the projection, cursors and
   * retained attachments, and cancel the previous generation's paging.
   */
  reset(channelId?: string): void {
    this.#retireGeneration(new Error("Channel view detached"));
    if (channelId !== undefined) this.#channelId = channelId;
    this.#view = createInitialChannelViewState();
    this.#attachments = new Map();
    this.#oldestSeq = null;
    this.#newestSeq = null;
    this.#messageTypesSignature = "[]";
    this.#replayDirty = false;
    this.#cell.update(initialSnapshot());
  }

  /**
   * Bind the client that owns this generation's paging and replay readiness.
   * The ready marker finalizes replay: pending replay projection is applied
   * and `hasMoreHistory` adopts the server's continuation flag.
   */
  attach(client: ChannelFeedClient): void {
    if (this.#disposed) return;
    const generation = this.#generation;
    generation.readyOff?.();
    generation.readyOff = null;
    generation.client = client;
    this.#channelId = client.channelId;
    const settle = () => {
      if (this.#generation !== generation || generation.lifetime.signal.aborted) return;
      this.#cell.transaction(() => {
        this.#flushReplay();
        this.#cell.update({ hasMoreHistory: Boolean(client.hasMoreBefore), replaySettled: true });
      });
    };
    if (client.connected) {
      settle();
      return;
    }
    this.#cell.update({ replaySettled: false, hasMoreHistory: Boolean(client.hasMoreBefore) });
    generation.readyOff = client.onReady(settle);
  }

  /**
   * Reset to a raw client and consume its event iterator for this generation.
   * Returns the generation's release; `reset`/`dispose` also end it.
   */
  follow(client: FollowableChannelClient): () => void {
    this.reset(client.channelId);
    this.attach(client);
    const generation = this.#generation;
    const signal = generation.lifetime.signal;
    const stream = client.events({ includeReplay: true, includeSignals: true, signal });
    void (async () => {
      try {
        for await (const event of stream) {
          if (signal.aborted || this.#generation !== generation) break;
          this.ingest(event);
        }
        if (!signal.aborted && this.#generation === generation) {
          this.#cell.transaction(() => this.#flushReplay());
        }
      } catch (error) {
        if (!signal.aborted) console.error("[ChannelViewFeed]", error);
      }
    })();
    signal.addEventListener(
      "abort",
      () => {
        void stream.return?.(undefined)?.catch((error: unknown) =>
          console.error("[ChannelViewFeed] retirement", error)
        );
      },
      { once: true }
    );
    return () => {
      if (this.#generation === generation) this.reset();
    };
  }

  /** Reduce one channel client event. */
  ingest(event: IncomingEvent | WireEvent): void {
    if (this.#disposed) return;
    const wire = event as WireEvent;
    // Paging includes durable events that do not render as messages.
    if (wire.delivery !== "signal" && wire.pubsubId !== undefined) {
      this.#oldestSeq = Math.min(this.#oldestSeq ?? Infinity, wire.pubsubId);
      this.#newestSeq = Math.max(this.#newestSeq ?? 0, wire.pubsubId);
    }
    this.#cell.transaction(() => {
      if (wire.phase === "live" && this.#replayDirty) this.#flushReplay();

      if (wire.delivery === "signal") {
        this.#ingestSignal(wire);
        return;
      }
      if (wire.type === CREDENTIAL_CONNECT_PAYLOAD_KIND && wire.payload) {
        this.#reduce(
          reduceChannelView(
            this.#view,
            pubsubChannelEventToEnvelope(this.#channelId, CREDENTIAL_CONNECT_PAYLOAD_KIND, {
              ...wire,
              payload: wire.payload,
            })
          ),
          wire.phase
        );
        return;
      }
      if (wire.type === AGENTIC_EVENT_PAYLOAD_KIND && wire.payload) {
        const payload = wire.payload as AgenticEvent;
        rememberAttachments(this.#attachments, payload, wire.attachments);
        this.#reduce(
          reduceChannelView(
            this.#view,
            pubsubAgenticEventToEnvelope(this.#channelId, {
              ...(wire.pubsubId !== undefined ? { pubsubId: wire.pubsubId } : {}),
              ...(wire.senderId !== undefined ? { senderId: wire.senderId } : {}),
              ...(wire.ts !== undefined ? { ts: wire.ts } : {}),
              ...(wire.senderMetadata ? { senderMetadata: wire.senderMetadata } : {}),
              ...(wire.contentClass ? { contentClass: wire.contentClass } : {}),
              ...(wire.externalKeys ? { externalKeys: wire.externalKeys } : {}),
              payload,
            })
          ),
          wire.phase
        );
      }
    });
  }

  /** Page backward through durable history before the oldest seen envelope. */
  async loadEarlierMessages(pageSize = TRANSCRIPT_PAGE_SIZE): Promise<void> {
    const generation = this.#generation;
    const client = generation.client;
    if (!client || generation.lifetime.signal.aborted || this.getSnapshot().loadingMore) return;
    const anchor = this.#oldestSeq;
    // Ready metadata can arrive before the replay consumer establishes its
    // cursor. An early request must not erase the server's continuation flag.
    if (anchor === null) return;
    if (anchor <= 1) {
      this.#cell.update({ hasMoreHistory: false });
      return;
    }
    this.#cell.update({ loadingMore: true });
    try {
      const result = await client.getReplayBefore(anchor, pageSize);
      if (generation.lifetime.signal.aborted) return;
      this.#cell.transaction(() => {
        this.#cell.update({ hasMoreHistory: Boolean(result.ready.hasMoreBefore) });
        for (const raw of result.logEvents as ReplayLogEvent[]) {
          // Advance the cursor for EVERY event in the page: a page of only
          // credential/presence events must still move the anchor.
          if (raw.id < (this.#oldestSeq ?? Infinity)) this.#oldestSeq = raw.id;
          if (this.#newestSeq === null || raw.id > this.#newestSeq) this.#newestSeq = raw.id;
          this.#view = this.#reduceReplayed(this.#view, raw);
        }
        this.#project("head");
      });
    } catch (error) {
      console.error("[ChannelViewFeed] loadEarlierMessages failed:", error);
    } finally {
      if (this.#generation === generation) this.#cell.update({ loadingMore: false });
    }
  }

  /**
   * Project a locally published envelope through durable replay. Channel
   * transports do not echo a publisher's own events, so the sender reads its
   * accepted publication back by sequence. Failures propagate to the caller.
   */
  async backfillAfterLocalPublish(pubsubId: number | undefined): Promise<void> {
    const generation = this.#generation;
    const client = generation.client;
    if (!client || generation.lifetime.signal.aborted || pubsubId === undefined) return;
    const cursor = this.#newestSeq ?? 0;
    if (cursor >= pubsubId) return;
    for await (const page of iterateChannelReplayAfterPages((request) => client.getReplayAfter(request), {
      after: cursor,
      throughSeq: pubsubId,
    })) {
      if (generation.lifetime.signal.aborted) return;
      for (const raw of page.logEvents as ReplayLogEvent[]) {
        this.#view = this.#reduceReplayed(this.#view, raw);
        if (raw.type === AGENTIC_EVENT_PAYLOAD_KIND && raw.payload) {
          if (raw.id < (this.#oldestSeq ?? Infinity)) this.#oldestSeq = raw.id;
          if (this.#newestSeq === null || raw.id > this.#newestSeq) this.#newestSeq = raw.id;
        }
      }
    }
    if (generation.lifetime.signal.aborted) return;
    this.#cell.transaction(() => this.#project("tail"));
  }

  dispose(): void {
    if (this.#disposed) return;
    this.reset();
    this.#disposed = true;
  }

  // ---------------------------------------------------------------------------

  #retireGeneration(reason: Error): void {
    const previous = this.#generation;
    previous.readyOff?.();
    previous.readyOff = null;
    previous.lifetime.abort(reason);
    this.#generation = { lifetime: new AbortController(), client: null, readyOff: null };
    if (this.#replayTimer !== null) clearTimeout(this.#replayTimer);
    if (this.#deltaTimer !== null) clearTimeout(this.#deltaTimer);
    this.#replayTimer = null;
    this.#deltaTimer = null;
  }

  #ingestSignal(wire: WireEvent): void {
    // Ephemeral agentic events (message.delta streaming) arrive as string
    // content signals with no seq/envelope identity; they never enter the
    // envelope reducer.
    if (wire.contentType !== AGENTIC_EVENT_PAYLOAD_KIND || typeof wire.content !== "string") return;
    let parsed: AgenticEvent | AgenticEvent[];
    try {
      parsed = JSON.parse(wire.content) as AgenticEvent | AgenticEvent[];
    } catch {
      return; // malformed ephemeral payload — the durable terminal wins
    }
    const deltas = (Array.isArray(parsed) ? parsed : [parsed]).filter(
      (candidate): candidate is AgenticEvent<"message.delta"> => candidate?.kind === "message.delta"
    );
    if (deltas.length === 0) return;
    let messages = this.#view.messages;
    for (const delta of deltas) messages = applyMessageEvent(messages, delta as never);
    this.#view = { ...this.#view, messages };
    this.#scheduleDeltaProjection();
  }

  #reduce(view: ChannelViewState, phase: WireEvent["phase"]): void {
    this.#view = view;
    if (phase === "replay") {
      this.#replayDirty = true;
      this.#scheduleReplayProjection();
    } else {
      this.#project("tail");
    }
  }

  #reduceReplayed(view: ChannelViewState, raw: ReplayLogEvent): ChannelViewState {
    const payload = raw.payload as Record<string, unknown> | undefined;
    if (!payload) return view;
    const wire = {
      pubsubId: raw.id,
      ...(raw.senderId !== undefined ? { senderId: raw.senderId } : {}),
      ...(raw.ts !== undefined ? { ts: raw.ts } : {}),
      ...(raw.senderMetadata
        ? { senderMetadata: raw.senderMetadata as WireEvent["senderMetadata"] }
        : {}),
    };
    if (raw.type === CREDENTIAL_CONNECT_PAYLOAD_KIND) {
      return reduceChannelView(
        view,
        pubsubChannelEventToEnvelope(this.#channelId, CREDENTIAL_CONNECT_PAYLOAD_KIND, {
          ...wire,
          payload,
        })
      );
    }
    if (raw.type !== AGENTIC_EVENT_PAYLOAD_KIND) return view;
    const event = payload as unknown as AgenticEvent;
    rememberAttachments(this.#attachments, event, raw.attachments as WireAttachment[] | undefined);
    return reduceChannelView(
      view,
      pubsubAgenticEventToEnvelope(this.#channelId, {
        ...wire,
        ...(raw.contentClass ? { contentClass: raw.contentClass } : {}),
        ...(raw.externalKeys ? { externalKeys: raw.externalKeys } : {}),
        payload: event,
      })
    );
  }

  #scheduleReplayProjection(): void {
    if (this.#replayTimer !== null) return;
    const generation = this.#generation;
    this.#replayTimer = setTimeout(() => {
      this.#replayTimer = null;
      if (this.#generation !== generation || this.#disposed) return;
      this.#cell.transaction(() => this.#flushReplay());
    }, 0);
  }

  #scheduleDeltaProjection(): void {
    if (this.#deltaTimer !== null) return;
    const generation = this.#generation;
    this.#deltaTimer = setTimeout(() => {
      this.#deltaTimer = null;
      if (this.#generation !== generation || this.#disposed) return;
      this.#cell.transaction(() => this.#project("tail"));
    }, DELTA_COALESCE_MS);
  }

  #flushReplay(): void {
    if (this.#replayTimer !== null) {
      clearTimeout(this.#replayTimer);
      this.#replayTimer = null;
    }
    if (!this.#replayDirty) return;
    this.#replayDirty = false;
    this.#project("tail");
  }

  /**
   * Derive the visible window. `head` keeps the oldest messages (history was
   * just prepended); `tail` keeps the newest.
   */
  #project(keep: "head" | "tail"): void {
    const snapshot = this.#cell.getSnapshot();
    const view = this.#view;
    const projected = chatMessagesFromChannelView(view);
    const visible =
      keep === "head" ? projected.slice(0, this.#maxVisible) : projected.slice(-this.#maxVisible);
    // Only the rendered window owns ChatMessage objects and attachment copies.
    const previousById = new Map(snapshot.messages.map((message) => [message.id, message]));
    let changed = visible.length !== snapshot.messages.length;
    const messages = visible.map((message, index) => {
      const attachments = this.#attachments.get(message.id);
      const next = attachments?.length ? { ...message, attachments } : message;
      const existing = previousById.get(message.id);
      const kept = existing && sameChatMessage(existing, next) ? existing : next;
      if (kept !== snapshot.messages[index]) changed = true;
      return kept;
    });
    // "Busy" includes WAITING turns: a turn parked on a credential approval is
    // still blocked work, so interrupt/flush affordances must stay enabled.
    const hasOpenTurn = Object.values(view.turns).some(
      (turn) => turn.status === "open" || turn.status === "waiting"
    );
    const nextMessageTypes = messageTypeDefinitionsFromChannelView(view);
    const signature = messageTypeDefinitionsSignature(nextMessageTypes);
    const messageTypesChanged = signature !== this.#messageTypesSignature;
    if (messageTypesChanged) this.#messageTypesSignature = signature;
    this.#cell.update({
      view,
      ...(changed ? { messages } : {}),
      ...(projected.length > this.#maxVisible ? { hasMoreHistory: true } : {}),
      hasOpenTurn,
      actionBar: sameActionBar(snapshot.actionBar, actionBarPayloadFromChannelView(view)),
      ...(messageTypesChanged ? { messageTypes: nextMessageTypes } : {}),
    });
  }
}

function sameActionBar(
  previous: ActionBarPayload | null,
  next: ActionBarPayload | null
): ActionBarPayload | null {
  if (previous === next) return previous;
  if (!previous || !next) return next;
  return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
}

type WireAttachment = {
  id?: string;
  data?: string | Uint8Array;
  mimeType: string;
  filename?: string;
  name?: string;
  size?: number;
};

function rememberAttachments(
  target: Map<string, Attachment[]>,
  payload: AgenticEvent,
  wireAttachments: WireAttachment[] | undefined
): void {
  const messageId = payload.causality?.messageId;
  if (!messageId || !wireAttachments || wireAttachments.length === 0) return;
  target.set(String(messageId), wireAttachments.map(wireAttachmentToAttachment));
}

function wireAttachmentToAttachment(attachment: WireAttachment): Attachment {
  const data =
    typeof attachment.data === "string"
      ? base64ToUint8Array(attachment.data)
      : attachment.data instanceof Uint8Array
        ? attachment.data
        : new Uint8Array();
  return {
    id: attachment.id ?? "",
    data,
    mimeType: attachment.mimeType,
    name: attachment.filename ?? attachment.name,
  };
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function attachmentSignatures(attachments: Attachment[] | undefined): string[] {
  return (attachments ?? []).map((attachment) =>
    [attachment.id, attachment.mimeType, attachment.name, attachment.data.length].join(":")
  );
}

/**
 * Structural equality for projected messages, used to keep the previous object
 * identity across rebuilds. Must cover every field the transcript renders —
 * including delivery-model fields (receipts, edits, retraction) — or the UI
 * would treat a real update as unchanged.
 */
export function sameChatMessage(a: ChatMessage, b: ChatMessage): boolean {
  if (
    a.id !== b.id ||
    a.senderId !== b.senderId ||
    a.content !== b.content ||
    a.contentType !== b.contentType ||
    a.kind !== b.kind ||
    a.complete !== b.complete ||
    a.error !== b.error ||
    a.pending !== b.pending ||
    a.tier !== b.tier ||
    a.replyTo !== b.replyTo ||
    a.retracted !== b.retracted ||
    a.revision !== b.revision ||
    a.editedAt !== b.editedAt
  ) {
    return false;
  }
  if (JSON.stringify(a.receipts ?? null) !== JSON.stringify(b.receipts ?? null)) return false;
  if (JSON.stringify(a.mentions ?? []) !== JSON.stringify(b.mentions ?? [])) return false;
  if (
    JSON.stringify(attachmentSignatures(a.attachments)) !==
    JSON.stringify(attachmentSignatures(b.attachments))
  )
    return false;
  if (a.invocation !== b.invocation && JSON.stringify(a.invocation) !== JSON.stringify(b.invocation))
    return false;
  if (a.approval !== b.approval && JSON.stringify(a.approval) !== JSON.stringify(b.approval))
    return false;
  if (a.inlineUi !== b.inlineUi && JSON.stringify(a.inlineUi) !== JSON.stringify(b.inlineUi))
    return false;
  if (a.custom !== b.custom) {
    if (!a.custom || !b.custom) return false;
    if (
      a.custom.messageId !== b.custom.messageId ||
      a.custom.typeId !== b.custom.typeId ||
      a.custom.displayMode !== b.custom.displayMode ||
      a.custom.lastSeq !== b.custom.lastSeq ||
      a.custom.updates !== b.custom.updates ||
      a.custom.initialState !== b.custom.initialState
    ) {
      return false;
    }
  }
  return true;
}

function messageTypeDefinitionsSignature(definitions: MessageTypeDefinition[]): string {
  return JSON.stringify(
    definitions.map((definition) => ({
      typeId: definition.typeId,
      displayMode: definition.displayMode,
      source: definition.source,
      imports: definition.imports,
      stateSchema: definition.stateSchema,
      updateSchema: definition.updateSchema,
      registeredBy: definition.registeredBy,
      updatedAtSeq: definition.updatedAtSeq,
      clearedAtSeq: definition.clearedAtSeq,
      cleared: definition.cleared,
    }))
  );
}
