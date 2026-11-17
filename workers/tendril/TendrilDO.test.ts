import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { DurableObjectContext, SqlResult } from "@workspace/runtime/worker";
import type { TendrilStateSignal } from "@workspace/tendril";
import { TendrilDO } from "./TendrilDO.js";

/** Records live signals instead of resolving the channel. */
class TestTendrilDO extends TendrilDO {
  signals: TendrilStateSignal[] = [];
  failNextSignal: Error | null = null;
  protected override async sendStateSignal(
    _identity: unknown,
    signal: TendrilStateSignal,
  ): Promise<void> {
    if (this.failNextSignal) {
      const error = this.failNextSignal;
      this.failNextSignal = null;
      throw error;
    }
    this.signals.push(signal);
  }
}

const KEY = "tendril-1";
const createInput = {
  source: "panels/road-trip",
  channelId: "chan-1",
  contextId: "ctx-1",
  name: "Road trip",
};

async function makeTendril() {
  const db = new DatabaseSync(":memory:");
  const instance = new TestTendrilDO(sqliteContext(db), {});
  await (instance as unknown as { initializeSchema(): Promise<void> }).initializeSchema();
  return { instance, db };
}

describe("TendrilDO", () => {
  it("creates idempotently and refuses a conflicting identity", async () => {
    const { instance, db } = await makeTendril();
    const first = await instance.create({ ...createInput, about: { purpose: "Trip companion" } });
    expect(first).toMatchObject({
      tendrilId: KEY,
      name: "Road trip",
      about: { purpose: "Trip companion" },
      presentations: [],
      functions: [],
      rev: 0,
    });
    expect(await instance.create(createInput)).toEqual(first);
    await expect(instance.create({ ...createInput, channelId: "other" })).rejects.toThrow(/channelId/);
    db.close();
  });

  it("refuses state and presentation calls before create", async () => {
    const { instance, db } = await makeTendril();
    await expect(instance.getState()).rejects.toThrow(/create\(\)/);
    await expect(instance.applyState({ cid: "c1", ops: [] })).rejects.toThrow(/create\(\)/);
    db.close();
  });

  it("applies ops in order, bumps rev and fans out a signal", async () => {
    const { instance, db } = await makeTendril();
    await instance.create(createInput);
    expect(
      await instance.applyState({ cid: "c1", ops: [{ op: "set", path: ["list", "a"], value: "milk" }] }),
    ).toEqual({ rev: 1 });
    expect(
      await instance.applyState({ cid: "c2", ops: [{ op: "set", path: ["list", "a"], value: "oat milk" }] }),
    ).toEqual({ rev: 2 });
    expect(await instance.getState()).toEqual({ rev: 2, state: { list: { a: "oat milk" } } });
    expect(instance.signals.map((s) => s.rev)).toEqual([1, 2]);
    expect(instance.signals[0]).toMatchObject({ tendrilId: KEY, ops: [{ op: "set", path: ["list", "a"] }] });
    db.close();
  });

  it("deduplicates by cid and re-sends the original revision's signal", async () => {
    const { instance, db } = await makeTendril();
    await instance.create(createInput);
    const ops = [{ op: "set" as const, path: ["n"], value: 1 }];
    instance.failNextSignal = new Error("channel unavailable");
    await expect(instance.applyState({ cid: "c1", ops })).rejects.toThrow("channel unavailable");
    // The write committed; the retry with the same cid does not apply it twice.
    expect(await instance.applyState({ cid: "c1", ops: [{ op: "set", path: ["n"], value: 99 }] })).toEqual({ rev: 1 });
    expect(await instance.getState()).toEqual({ rev: 1, state: { n: 1 } });
    expect(instance.signals).toHaveLength(1);
    expect(instance.signals[0]!.ops).toEqual(ops);
    db.close();
  });

  it("rejects invalid ops without changing state", async () => {
    const { instance, db } = await makeTendril();
    await instance.create(createInput);
    await expect(
      instance.applyState({ cid: "bad", ops: [{ op: "set", path: ["__proto__", "x"], value: 1 }] }),
    ).rejects.toThrow();
    expect(await instance.getState()).toEqual({ rev: 0, state: {} });
    db.close();
  });

  it("tracks presentations and their functions", async () => {
    const { instance, db } = await makeTendril();
    await instance.create(createInput);
    await instance.registerPresentation({ slotId: "s1", deviceId: "phone", label: "Phone" });
    await instance.registerPresentation({ slotId: "s2", deviceId: null, label: "Headless" });
    await instance.registerFunctions("s1", [
      { name: "next", description: "Next step", phrases: ["next step"] },
    ]);
    await instance.registerFunctions("s1", [
      { name: "tick", description: "Tick an item", phrases: ["tick *"] },
    ]);
    let d = await instance.describe();
    expect(d.presentations).toEqual([
      { slotId: "s1", deviceId: "phone", label: "Phone" },
      { slotId: "s2", deviceId: null, label: "Headless" },
    ]);
    expect(d.functions).toEqual([
      { name: "tick", description: "Tick an item", phrases: ["tick *"], slotId: "s1" },
    ]);
    await instance.unregisterPresentation("s1");
    d = await instance.describe();
    expect(d.presentations.map((p) => p.slotId)).toEqual(["s2"]);
    expect(d.functions).toEqual([]);
    db.close();
  });
});

function sqliteContext(db: DatabaseSync): DurableObjectContext {
  const sql = {
    exec(query: string, ...bindings: unknown[]): SqlResult {
      if (bindings.length === 0 && /^\s*CREATE\b/i.test(query) && query.includes(";")) {
        db.exec(query);
        return {
          toArray: () => [],
          one: () => {
            throw new Error("Expected one row, received 0");
          },
        };
      }
      const statement = db.prepare(query);
      const rows =
        /^\s*(?:SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(query) || /\bRETURNING\b/i.test(query)
          ? (statement.all(...(bindings as [])) as Record<string, unknown>[])
          : (statement.run(...(bindings as [])), []);
      return {
        toArray: () => rows,
        one: () => {
          if (rows.length !== 1) throw new Error(`Expected one row, received ${rows.length}`);
          return rows[0]!;
        },
      };
    },
  };
  const tx = <T>(callback: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  return {
    props: { stateArgs: null, image: null, nativeOwner: null },
    id: { toString: () => KEY, name: KEY },
    storage: {
      sql,
      async sync() {},
      setAlarm() {},
      async getAlarm() {
        return null;
      },
      deleteAlarm() {},
      async transaction<T>(callback: () => Promise<T>): Promise<T> {
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = await callback();
          db.exec("COMMIT");
          return result;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
      transactionSync: tx,
    },
    acceptWebSocket() {},
    getWebSockets: () => [],
    blockConcurrencyWhile: (fn) => fn(),
  } as DurableObjectContext;
}
