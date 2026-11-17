import { describe, expect, it } from "vitest";
import type { HostCodeSpec, HostedCode } from "@vibestudio/durable/codeHost";
import { HostedEvalKernel } from "./hosted-eval-kernel.js";

interface Seen {
  method: string;
  args: unknown[];
  limits?: { cpuMs?: number };
}

/** An entity standing in for the agent: its own state and a kernel that records what it is asked. */
function entity() {
  const state = new Map<string, string>();
  const specs: HostCodeSpec[] = [];
  const seen: Seen[] = [];
  let released = 0;
  const make = (limits?: { cpuMs?: number }): HostedCode =>
    ({
      call: async (method: string, ...args: unknown[]) => {
        seen.push({ method, args, ...(limits ? { limits } : {}) });
        return { ok: true };
      },
      limited: (next: { cpuMs?: number }) => make(next),
      restart: async () => undefined,
      release: async () => {
        released += 1;
      },
    }) as unknown as HostedCode;
  const host = {
    hostCode: async (spec: HostCodeSpec) => {
      specs.push(spec);
      return make();
    },
    getStateValue: (key: string) => state.get(key) ?? null,
    setStateValue: (key: string, value: string) => void state.set(key, value),
  };
  return { host, specs, seen, released: () => released };
}

const HOST = { kind: "host" };

describe("HostedEvalKernel (the kernel an agent hosts itself)", () => {
  it("hosts the eval kernel and relays every call as the hosting entity, with no session nonce", async () => {
    const e = entity();
    const kernel = new HostedEvalKernel(e.host);
    await kernel.start({ runId: "r1", code: "1" }, "nonce-1");
    await kernel.await("r1", { waitMs: 5 });
    await kernel.events("r1", { after: 3 });
    await kernel.cancel("r1");
    await kernel.get("r1");
    await kernel.receipt("r1");
    const identity = { runDigest: "a".repeat(64), resultDigest: "b".repeat(64) };
    await kernel.acknowledge("r1", identity);
    expect(e.specs[0]!.executable).toEqual({
      source: "workers/eval-kernel",
      className: "EvalKernel",
    });
    expect(e.seen.map((entry) => entry.method)).toEqual([
      "start",
      "await",
      "events",
      "cancel",
      "get",
      "receipt",
      "acknowledgeRunResult",
    ]);
    // The admission's nonce rides in the run's arguments (the kernel keeps it for the run's outbound calls),
    // and every call is the hosting entity's own.
    expect(e.seen[0]!.args).toEqual([
      { runId: "r1", code: "1", executionSessionNonce: "nonce-1" },
      HOST,
    ]);
    expect(e.seen[1]!.args).toEqual(["r1", { waitMs: 5 }, HOST]);
    expect(e.seen[6]!.args).toEqual(["r1", identity, HOST]);
  });

  it("carries the run's timeoutMs as the CPU limit of its start call, and no limit without one", async () => {
    const e = entity();
    const kernel = new HostedEvalKernel(e.host);
    await kernel.start({ runId: "r1", timeoutMs: 5000 }, "n1");
    await kernel.start({ runId: "r2" }, "n2");
    expect(e.seen[0]!.limits).toEqual({ cpuMs: 5000 });
    expect(e.seen[1]!.limits).toBeUndefined();
  });

  it("refuses a start without a run id or the admission nonce", async () => {
    const kernel = new HostedEvalKernel(entity().host);
    await expect(kernel.start({ runId: "" }, "n")).rejects.toThrow(/needs a run id/);
    await expect(kernel.start({ runId: "r" }, "")).rejects.toThrow(/needs the admission nonce/);
  });

  it("starts no kernel to list its roots, reset it or relay a lifecycle that it never had", async () => {
    const e = entity();
    const kernel = new HostedEvalKernel(e.host);
    expect(kernel.started).toBe(false);
    expect(await kernel.executionRoots()).toEqual([]);
    expect(await kernel.reset()).toEqual({ ok: true });
    await kernel.lifecycle({ phase: "release" });
    await kernel.end();
    expect(e.specs).toEqual([]);
    await kernel.start({ runId: "r1" }, "n1");
    expect(kernel.started).toBe(true);
    await kernel.executionRoots();
    expect(e.seen.at(-1)!.method).toBe("listRetainedExecutionRoots");
  });

  it("relays the entity's lifecycle to the kernel and ends the heap's hold on release", async () => {
    const e = entity();
    const kernel = new HostedEvalKernel(e.host);
    await kernel.start({ runId: "r1" }, "n1");
    await kernel.lifecycle({ phase: "peer-obligations", mode: "retire" });
    expect(e.released()).toBe(0);
    await kernel.lifecycle({ phase: "release", mode: "retire" });
    expect(e.released()).toBe(1);
    expect(e.seen.filter((entry) => entry.method === "lifecycle")).toHaveLength(2);
  });

  it("records the host's facts and its publication interlock in the kernel", async () => {
    const e = entity();
    const kernel = new HostedEvalKernel(e.host);
    await kernel.recordAuthorityEvent("r1", "authority-requested", { a: 1 });
    await kernel.retainExecutionRoot("r1", "@workspace/x", { digest: "d" });
    expect(e.seen.map((entry) => entry.method)).toEqual([
      "appendAuthorityEvent",
      "retainExecutionRoot",
    ]);
  });
});
