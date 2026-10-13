import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventStreamItem, PubSubClient } from "@workspace/pubsub";
import { ChannelSignalsStore } from "./channel-signals-store.js";

function controllableClient() {
  const pending: Array<(value: IteratorResult<EventStreamItem>) => void> = [];
  const queued: EventStreamItem[] = [];
  let returned = false;
  const iterator: AsyncIterableIterator<EventStreamItem> = {
    next: () =>
      queued.length > 0
        ? Promise.resolve({ value: queued.shift()!, done: false })
        : new Promise((resolve) => pending.push(resolve)),
    return: async () => {
      returned = true;
      for (const resolve of pending.splice(0)) resolve({ value: undefined, done: true });
      return { value: undefined, done: true };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
  const client = { events: vi.fn(() => iterator) } satisfies Pick<PubSubClient, "events">;
  const emitEvent = (event: EventStreamItem) => {
    const resolve = pending.shift();
    if (resolve) resolve({ value: event, done: false });
    else queued.push(event);
  };
  return {
    client,
    emit(content: string, contentType = "status") {
      emitEvent({
        delivery: "signal",
        type: "signal",
        senderId: "agent",
        content,
        contentType,
        ts: Date.now(),
      });
    },
    completeReplay(generation: number) {
      emitEvent({ type: "replay-complete", delivery: "control", generation, hasMoreBefore: false });
    },
    get returned() {
      return returned;
    },
  };
}

describe("ChannelSignalsStore", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("caps the window and expires signals after their TTL", async () => {
    const source = controllableClient();
    const store = new ChannelSignalsStore(source.client, { maxSignals: 2, ttlMs: 3000 });
    const release = store.retain();
    for (const text of ["one", "two", "three"]) {
      source.emit(text);
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(store.getSnapshot().map((signal) => signal.content)).toEqual(["two", "three"]);
    const before = store.getSnapshot();
    expect(store.getSnapshot()).toBe(before);
    await vi.advanceTimersByTimeAsync(3000);
    expect(store.getSnapshot()).toEqual([]);
    // The sweep stops once the window is empty.
    expect(vi.getTimerCount()).toBe(0);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(source.returned).toBe(true);
  });

  it("suppresses non-pill signals", async () => {
    const source = controllableClient();
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const store = new ChannelSignalsStore(source.client);
    const release = store.retain();
    source.emit(JSON.stringify({ message: null }), "vibestudio-ext-working");
    source.emit(JSON.stringify({ message: "Thinking" }), "vibestudio-ext-working");
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().map((signal) => signal.content)).toEqual(["Thinking"]);
    expect(debug).toHaveBeenCalledTimes(1);
    release();
    debug.mockRestore();
  });

  it("keeps replay readiness controls out of the working-pill window", async () => {
    const source = controllableClient();
    const store = new ChannelSignalsStore(source.client);
    const release = store.retain();
    source.completeReplay(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    source.emit("Thinking");
    await vi.advanceTimersByTimeAsync(0);
    const before = store.getSnapshot();
    source.completeReplay(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot()).toBe(before);
    expect(before.map((signal) => signal.content)).toEqual(["Thinking"]);
    expect(vi.getTimerCount()).toBe(1);
    release();
  });
});
