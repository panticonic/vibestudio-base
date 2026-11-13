import { describe, expect, it } from "vitest";
import { applyOps, getPath, mergePatchToOps, rebase, toPath } from "./state.js";
import { StateOpSchema, TendrilEventPayloadSchema } from "./protocol.js";

describe("tendril state ops", () => {
  it("sets and deletes nested paths, creating intermediate objects", () => {
    let s = applyOps({}, [
      { op: "set", path: ["list", "a"], value: { text: "milk" } },
      { op: "set", path: ["list", "b"], value: { text: "eggs" } },
      { op: "delete", path: ["list", "a"] },
    ]);
    expect(s).toEqual({ list: { b: { text: "eggs" } } });
    s = applyOps(s, [{ op: "delete", path: ["missing", "x"] }]);
    expect(s).toEqual({ list: { b: { text: "eggs" } } });
  });

  it("copies values so later mutation of the input cannot leak into state", () => {
    const value = { n: 1 };
    const s = applyOps({}, [{ op: "set", path: ["v"], value }]);
    value.n = 2;
    expect(getPath(s, ["v", "n"])).toBe(1);
  });

  it("refuses prototype-polluting keys", () => {
    expect(() => applyOps({}, [{ op: "set", path: ["__proto__", "x"], value: 1 }])).toThrow();
    expect(() => mergePatchToOps({}, JSON.parse('{"constructor":{"a":1}}'))).toThrow();
  });

  it("turns a merge patch into leaf ops (null deletes, objects recurse)", () => {
    const state = { a: { x: 1, y: 2 }, b: 3 };
    const ops = mergePatchToOps(state, { a: { x: null, z: 4 }, b: [1], c: { d: null, e: 5 } });
    expect(ops).toEqual([
      { op: "delete", path: ["a", "x"] },
      { op: "set", path: ["a", "z"], value: 4 },
      { op: "set", path: ["b"], value: [1] },
      { op: "set", path: ["c"], value: { e: 5 } },
    ]);
  });

  it("is last-writer-wins per path in application order", () => {
    const fromPhone = [{ op: "set" as const, path: ["title"], value: "phone" }];
    const fromAgent = [{ op: "set" as const, path: ["title"], value: "agent" }];
    expect(applyOps(applyOps({}, fromPhone), fromAgent)).toEqual({ title: "agent" });
    expect(applyOps(applyOps({}, fromAgent), fromPhone)).toEqual({ title: "phone" });
  });

  it("rebases pending local ops over an authoritative snapshot without mutating it", () => {
    const auth = { list: { a: 1 } };
    const view = rebase(auth, [{ ops: [{ op: "set", path: ["list", "b"], value: 2 }] }]);
    expect(view).toEqual({ list: { a: 1, b: 2 } });
    expect(auth).toEqual({ list: { a: 1 } });
  });

  it("parses dotted and array paths", () => {
    expect(toPath("a.b")).toEqual(["a", "b"]);
    expect(toPath(["a.b"])).toEqual(["a.b"]);
    expect(toPath(undefined)).toEqual([]);
  });
});

describe("tendril protocol", () => {
  it("validates state ops", () => {
    expect(StateOpSchema.safeParse({ op: "set", path: ["a"], value: 1 }).success).toBe(true);
    expect(StateOpSchema.safeParse({ op: "merge", path: [] }).success).toBe(false);
  });

  it("bounds event payloads at 64 KiB", () => {
    const base = { tendrilId: "t", slotId: "s", deviceId: null, cid: "c" };
    expect(TendrilEventPayloadSchema.safeParse({ ...base, data: { ok: true } }).success).toBe(true);
    const big = TendrilEventPayloadSchema.safeParse({ ...base, data: "x".repeat(70_000) });
    expect(big.success).toBe(false);
  });
});
