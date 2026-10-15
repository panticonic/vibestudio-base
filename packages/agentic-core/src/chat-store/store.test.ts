import { describe, expect, it, vi } from "vitest";
import { RetainCount, StateCell, shallowEqual } from "./store.js";

describe("StateCell", () => {
  it("keeps the snapshot identity when an update changes nothing", () => {
    const cell = new StateCell({ a: 1, list: [1] as number[] });
    const listener = vi.fn();
    cell.subscribe(listener);
    const before = cell.getSnapshot();
    cell.update({ a: 1, list: before.list });
    expect(cell.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    cell.update({ a: 2 });
    expect(cell.getSnapshot()).not.toBe(before);
    expect(cell.getSnapshot().list).toBe(before.list);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("notifies once per outermost transaction, including nested reactions", () => {
    const cell = new StateCell({ a: 0, b: 0 });
    const seen: Array<{ a: number; b: number }> = [];
    cell.subscribe(() => seen.push(cell.getSnapshot()));
    cell.transaction(() => {
      cell.update({ a: 1 });
      cell.transaction(() => cell.update((current) => ({ b: current.a + 1 })));
    });
    expect(seen).toEqual([{ a: 1, b: 2 }]);
  });

  it("keeps notifying the rest when one listener throws", () => {
    const cell = new StateCell({ a: 0 });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const after = vi.fn();
    cell.subscribe(() => {
      throw new Error("listener defect");
    });
    cell.subscribe(after);
    cell.update({ a: 1 });
    expect(after).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});

describe("RetainCount", () => {
  it("starts on the first holder and disposes one turn after the last release", async () => {
    const start = vi.fn();
    const dispose = vi.fn();
    const count = new RetainCount({ start, dispose });
    const release = count.retain();
    const second = count.retain();
    expect(start).toHaveBeenCalledTimes(1);
    release();
    second();
    expect(dispose).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(count.disposed).toBe(true);
    expect(() => count.retain()).toThrow(/cannot be retained again/);
  });

  it("keeps the instance when re-retained in the same turn (StrictMode remount)", async () => {
    const start = vi.fn();
    const dispose = vi.fn();
    const count = new RetainCount({ start, dispose });
    count.retain()();
    const again = count.retain();
    await Promise.resolve();
    expect(dispose).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
    again();
    again(); // a release is idempotent
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes immediately on explicit owner shutdown, once", () => {
    const dispose = vi.fn();
    const count = new RetainCount({ start: () => undefined, dispose });
    count.disposeNow();
    count.disposeNow();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe("shallowEqual", () => {
  it("compares arrays and plain objects by member identity", () => {
    const member = { id: 1 };
    expect(shallowEqual([member], [member])).toBe(true);
    expect(shallowEqual([member], [{ id: 1 }])).toBe(false);
    expect(shallowEqual({ a: member }, { a: member })).toBe(true);
    expect(shallowEqual([1], { 0: 1 })).toBe(false);
  });
});
