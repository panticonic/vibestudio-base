import { describe, expect, it } from "vitest";
import { AsyncQueue, createFanout } from "./async-queue.js";

describe("AsyncQueue", () => {
  it("preserves a large buffered burst in FIFO order", async () => {
    const queue = new AsyncQueue<number>();
    const count = 20_000;
    for (let i = 0; i < count; i++) queue.push(i);
    queue.close();

    const received: number[] = [];
    for await (const value of queue) received.push(value);

    expect(received).toHaveLength(count);
    expect(received[0]).toBe(0);
    expect(received[10_000]).toBe(10_000);
    expect(received[count - 1]).toBe(count - 1);
    expect(queue.length).toBe(0);
  });

  it("settles concurrently waiting consumers in FIFO order", async () => {
    const queue = new AsyncQueue<string>();
    const first = queue[Symbol.asyncIterator]().next();
    const second = queue[Symbol.asyncIterator]().next();

    queue.push("first");
    queue.push("second");

    await expect(first).resolves.toEqual({ value: "first", done: false });
    await expect(second).resolves.toEqual({ value: "second", done: false });
  });

  it("releases all waiting consumers when closed", async () => {
    const queue = new AsyncQueue<string>();
    const first = queue[Symbol.asyncIterator]().next();
    const second = queue[Symbol.asyncIterator]().next();

    queue.close();

    await expect(first).resolves.toEqual({ value: undefined, done: true });
    await expect(second).resolves.toEqual({ value: undefined, done: true });
  });
});


describe("fanout consumer retirement", () => {
  it("settles late subscribers after the producer has terminated", async () => {
    const fanout = createFanout<string>();
    fanout.close();
    await expect(fanout.subscribe().next()).resolves.toMatchObject({ done: true });
    const failed = createFanout<string>();
    const original = new Error("producer failure");
    failed.close(original);
    await expect(failed.subscribe().next()).rejects.toBe(original);
  });

  it("releases an unread backlog when the subscriber returns", async () => {
    const fanout = createFanout<{ payload: string }>();
    const subscriber = fanout.subscribe();
    fanout.emit({ payload: "an unclaimed payload" });
    await subscriber.return?.();
    expect(fanout.subscriberCount).toBe(0);
    await expect(subscriber.next()).resolves.toMatchObject({ done: true });
  });
});
