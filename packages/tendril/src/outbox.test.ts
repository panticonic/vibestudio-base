import { describe, expect, it } from "vitest";
import { createOutbox, type OutboxItem, type OutboxStorage } from "./outbox.js";

function memoryStorage(): OutboxStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const item = (cid: string): OutboxItem => ({ cid, kind: "publish", type: "tendril.event", payload: { cid } });

describe("outbox", () => {
  it("delivers in order and reports delivery", async () => {
    const delivered: string[] = [];
    const outbox = createOutbox({ deliver: async (i) => void delivered.push(i.cid) });
    expect(await outbox.push(item("a"))).toBe(true);
    expect(await outbox.push(item("b"))).toBe(true);
    expect(delivered).toEqual(["a", "b"]);
    expect(outbox.size).toBe(0);
  });

  it("keeps failed items, in order, until a flush succeeds", async () => {
    let online = false;
    const delivered: string[] = [];
    const outbox = createOutbox({
      deliver: async (i) => {
        if (!online) throw new Error("offline");
        delivered.push(i.cid);
      },
    });
    expect(await outbox.push(item("a"))).toBe(false);
    expect(await outbox.push(item("b"))).toBe(false);
    expect(outbox.pending().map((i) => i.cid)).toEqual(["a", "b"]);
    online = true;
    await outbox.flush();
    expect(delivered).toEqual(["a", "b"]);
    expect(outbox.size).toBe(0);
  });

  it("survives a reload through storage and resends with the same client ids", async () => {
    const storage = memoryStorage();
    const first = createOutbox({
      storage,
      storageKey: "k",
      deliver: async () => {
        throw new Error("offline");
      },
    });
    await first.push(item("a"));
    expect(JSON.parse(storage.data.get("k")!)).toHaveLength(1);
    const delivered: string[] = [];
    const second = createOutbox({ storage, storageKey: "k", deliver: async (i) => void delivered.push(i.cid) });
    await second.flush();
    expect(delivered).toEqual(["a"]);
    expect(storage.data.has("k")).toBe(false);
  });
});
