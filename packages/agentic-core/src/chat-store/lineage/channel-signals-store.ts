/**
 * ChannelSignalsStore — a small expiring window of live, non-durable channel
 * signals for transient UI affordances (working pills, status notes).
 *
 * Expiry is product behaviour: each signal lives `ttlMs` (default 8 s) and the
 * window holds at most `maxSignals`. A 1 s sweep removes expired signals; it
 * runs only while the window is non-empty.
 */

import type { ParticipantMetadata, PubSubClient } from "@workspace/pubsub";
import { RetainCount, StateCell, type ReadableStore } from "../store.js";

export interface ChannelSignal {
  id: string;
  ts: number;
  content: string;
  contentType?: string;
}

export interface ChannelSignalsOptions {
  maxSignals?: number;
  ttlMs?: number;
}

export const DEFAULT_SIGNAL_TTL_MS = 8000;
export const DEFAULT_MAX_SIGNALS = 5;
const SWEEP_INTERVAL_MS = 1000;

/** Map a signal to its pill text, or `null` when it is not a pill. */
export function normalizeSignalContent(contentType: string | undefined, content: string): string | null {
  if (contentType === "inline_ui") return null;
  if (contentType === "fork.head_changed") return null;
  // Agentic transcript events (streaming deltas) ride the signal channel but
  // belong to the transcript reducer; thinking pills arrive separately as
  // `vibestudio-ext-working` signals from the agent vessel.
  if (contentType === "agentic.trajectory.v1/event") return null;
  if (contentType !== "vibestudio-ext-working") return content;
  try {
    const parsed = JSON.parse(content) as { message?: unknown };
    if (parsed.message == null || parsed.message === "") return null;
    return typeof parsed.message === "string" ? parsed.message : JSON.stringify(parsed.message);
  } catch {
    return content.trim() || null;
  }
}

interface StoredSignal {
  signal: ChannelSignal;
  expiresAt: number;
}

const EMPTY: readonly ChannelSignal[] = [];

export class ChannelSignalsStore implements ReadableStore<readonly ChannelSignal[]> {
  readonly #client: Pick<PubSubClient<ParticipantMetadata>, "events">;
  readonly #maxSignals: number;
  readonly #ttlMs: number;
  readonly #cell = new StateCell<{ stored: readonly StoredSignal[]; signals: readonly ChannelSignal[] }>({
    stored: [],
    signals: EMPTY,
  });
  readonly #retained: RetainCount;
  #stream: AsyncIterator<unknown> | null = null;
  #sweep: ReturnType<typeof setInterval> | null = null;
  #sequence = 0;
  #stopped = false;

  constructor(
    client: Pick<PubSubClient<ParticipantMetadata>, "events">,
    options: ChannelSignalsOptions = {}
  ) {
    this.#client = client;
    this.#maxSignals = options.maxSignals ?? DEFAULT_MAX_SIGNALS;
    this.#ttlMs = options.ttlMs ?? DEFAULT_SIGNAL_TTL_MS;
    this.#retained = new RetainCount({ start: () => this.#start(), dispose: () => this.#stop() });
  }

  readonly getSnapshot = (): readonly ChannelSignal[] => this.#cell.getSnapshot().signals;
  readonly subscribe = (listener: () => void): (() => void) => this.#cell.subscribe(listener);

  retain(): () => void {
    return this.#retained.retain();
  }

  dispose(): void {
    this.#retained.disposeNow();
  }

  #start(): void {
    const stream = this.#client.events({ includeSignals: true });
    this.#stream = stream;
    void (async () => {
      try {
        for await (const event of stream) {
          if (this.#stopped) break;
          if (event.delivery !== "signal" || event.type !== "signal") continue;
          if (!event.content) continue;
          const content = normalizeSignalContent(event.contentType, event.content);
          if (content == null) {
            console.debug("[useChannelSignals] suppressed transient signal", {
              contentType: event.contentType,
              senderId: event.senderId,
              ts: event.ts,
              content: event.content,
            });
            continue;
          }
          const ts = event.ts ?? Date.now();
          this.#add({
            signal: {
              id: `${ts}:${this.#sequence++}`,
              ts,
              content,
              ...(event.contentType !== undefined ? { contentType: event.contentType } : {}),
            },
            expiresAt: Date.now() + this.#ttlMs,
          });
        }
      } catch (error) {
        if (!this.#stopped) console.error("[useChannelSignals]", error);
      }
    })();
  }

  #stop(): void {
    this.#stopped = true;
    if (this.#sweep !== null) clearInterval(this.#sweep);
    this.#sweep = null;
    void this.#stream?.return?.()?.catch(() => undefined);
    this.#stream = null;
    this.#publish([]);
  }

  #add(entry: StoredSignal): void {
    const now = Date.now();
    const next = [...this.#cell.getSnapshot().stored.filter((item) => item.expiresAt > now), entry];
    this.#publish(next.slice(Math.max(0, next.length - this.#maxSignals)));
  }

  #expire(): void {
    const now = Date.now();
    const stored = this.#cell.getSnapshot().stored;
    const live = stored.filter((item) => item.expiresAt > now);
    if (live.length !== stored.length) this.#publish(live);
  }

  #publish(stored: readonly StoredSignal[]): void {
    this.#cell.update({
      stored,
      signals: stored.length === 0 ? EMPTY : stored.map((item) => item.signal),
    });
    if (stored.length > 0 && this.#sweep === null && !this.#stopped) {
      this.#sweep = setInterval(() => this.#expire(), SWEEP_INTERVAL_MS);
    } else if (stored.length === 0 && this.#sweep !== null) {
      clearInterval(this.#sweep);
      this.#sweep = null;
    }
  }
}
