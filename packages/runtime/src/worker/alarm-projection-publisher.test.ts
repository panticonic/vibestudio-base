import { describe, expect, it } from "vitest";
import { AlarmProjectionPublisher } from "./alarm-projection-publisher.js";

describe("AlarmProjectionPublisher", () => {
  it("shares an in-flight write and omits acknowledged projections", async () => {
    const writes: (number | null)[] = [];
    const publisher = new AlarmProjectionPublisher(async wakeAt => { writes.push(wakeAt); });
    const first = publisher.publish(null);
    expect(publisher.publish(null)).toBe(first);
    await first;
    await publisher.publish(null);
    await publisher.publish(123);
    await publisher.publish(123);
    await publisher.publish(null);
    expect(writes).toEqual([null, 123, null]);
  });

  it("orders changed projections while the preceding write is blocked", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const writes: (number | null)[] = [];
    const publisher = new AlarmProjectionPublisher(async wakeAt => {
      writes.push(wakeAt);
      if (writes.length === 1) await gate;
    });
    const first = publisher.publish(1);
    const second = publisher.publish(2);
    const third = publisher.publish(1);
    await Promise.resolve();
    expect(writes).toEqual([1]);
    release();
    await Promise.all([first, second, third]);
    expect(writes).toEqual([1, 2, 1]);
  });

  it("retains original failures and repairs the same projection on its next request", async () => {
    const failure = new Error("lost alarm acknowledgement");
    let attempts = 0;
    const publisher = new AlarmProjectionPublisher(async () => {
      if (++attempts === 1) throw failure;
    });
    await expect(publisher.publish(1)).rejects.toBe(failure);
    await publisher.publish(1);
    await publisher.publish(1);
    expect(attempts).toBe(2);
  });

  it("does not retain an acknowledgement from before alarm delivery or lifecycle invalidation", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let attempts = 0;
    const publisher = new AlarmProjectionPublisher(async () => {
      if (++attempts === 1) await gate;
    });
    const old = publisher.publish(1);
    publisher.invalidate();
    release();
    await old;
    await publisher.publish(1);
    publisher.invalidate();
    await publisher.publish(1);
    expect(attempts).toBe(3);
  });
});
