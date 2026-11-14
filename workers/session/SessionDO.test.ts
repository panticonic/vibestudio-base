import { describe, expect, it } from "vitest";
import { createTestDO } from "@workspace/runtime/worker/test-utils";
import { SessionDO } from "./SessionDO.js";

interface Seen {
  op: string;
  method?: string;
  args?: unknown[];
  executable?: { source: string; className: string };
}

/** A CODE_HOST binding standing in for the root: it records what the session asks of it. */
function codeHost(behaviour: (seen: Seen) => unknown = () => ({ ok: true })) {
  const seen: Seen[] = [];
  const env = {
    CODE_HOST: {
      fetch: async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as Seen;
        seen.push(body);
        if (body.op !== "call") return Response.json({ hosted: true });
        try {
          return Response.json({ result: behaviour(body) });
        } catch (error) {
          return Response.json({ error: { message: String(error) } }, { status: 500 });
        }
      },
    },
  };
  return { env, seen };
}

const PRINCIPAL = "panel:abc";
const props = {
  nativeOwner: null,
  stateArgs: { principalId: PRINCIPAL, scope: "default" },
  image: null,
  codeHost: { name: "root", proof: "proof" },
};

describe("SessionDO", () => {
  it("hosts the kernel its manifest names and relays start with the admission nonce", async () => {
    const host = codeHost();
    const { call } = await createTestDO(SessionDO, host.env, { props });
    await call("start", { runId: "r1", code: "1" }, "nonce-1");
    const started = host.seen.find((entry) => entry.method === "start")!;
    expect(started.executable).toEqual({ source: "workers/eval-kernel", className: "EvalKernel" });
    expect(started.args).toEqual([
      { runId: "r1", code: "1", executionSessionNonce: "nonce-1" },
      { kind: "session", admissionNonce: "nonce-1" },
    ]);
  });

  it("relays run-scoped calls with the nonce its run was admitted under, and refuses an unknown run", async () => {
    const host = codeHost();
    const { call } = await createTestDO(SessionDO, host.env, { props });
    await call("start", { runId: "r1" }, "nonce-1");
    await call("start", { runId: "r2" }, "nonce-2");
    await call("await", "r2", { waitMs: 5 });
    await call("events", "r1", { after: 3 });
    await call("cancel", "r1");
    const bymethod = (method: string) => host.seen.filter((entry) => entry.method === method);
    expect(bymethod("await")[0]!.args).toEqual([
      "r2",
      { waitMs: 5 },
      { kind: "session", admissionNonce: "nonce-2" },
    ]);
    expect(bymethod("events")[0]!.args).toEqual([
      "r1",
      { after: 3 },
      { kind: "session", admissionNonce: "nonce-1" },
    ]);
    expect(bymethod("cancel")[0]!.args).toEqual([
      "r1",
      { kind: "session", admissionNonce: "nonce-1" },
    ]);
    await expect(call("await", "never-admitted")).rejects.toThrow(
      /was not admitted by this session/
    );
  });

  it("serves its principal and the host, and nobody else", async () => {
    const host = codeHost();
    const { call, callAs } = await createTestDO(SessionDO, host.env, { props });
    await callAs({ callerId: PRINCIPAL, callerKind: "panel" }, "start", { runId: "r1" }, "n");
    await call("get", "r1");
    await expect(
      callAs({ callerId: "panel:other", callerKind: "panel" }, "get", "r1")
    ).rejects.toThrow(/serves another principal/);
    await expect(
      callAs({ callerId: "panel:other", callerKind: "panel" }, "start", { runId: "r2" }, "n2")
    ).rejects.toThrow(/serves another principal/);
    // The refused start recorded nothing and hosted nothing for it.
    expect(host.seen.filter((entry) => entry.method === "start")).toHaveLength(1);
  });

  it("a refused start leaves no nonce behind; reset forgets them", async () => {
    let refuse = true;
    const host = codeHost((seen) => {
      if (seen.method === "start" && refuse) throw new Error("refused by the kernel");
      return { ok: true };
    });
    const { call } = await createTestDO(SessionDO, host.env, { props });
    await expect(call("start", { runId: "r1" }, "n1")).rejects.toThrow();
    await expect(call("await", "r1")).rejects.toThrow(/was not admitted/);
    refuse = false;
    await call("start", { runId: "r1" }, "n1");
    await call("reset");
    await expect(call("await", "r1")).rejects.toThrow(/was not admitted/);
    // A scope-level call names no run: the newest nonce rides along, or none before a run exists.
    await call("start", { runId: "r3" }, "n3");
    await call("readScopeTextPage", "k", 0, 10);
    const page = host.seen.filter((entry) => entry.method === "readScopeTextPage").at(-1)!;
    expect(page.args!.at(-1)).toEqual({ kind: "session", admissionNonce: "n3" });
  });

  it("end releases the hold and has no principal without stateArgs", async () => {
    const host = codeHost();
    const { call } = await createTestDO(SessionDO, host.env, { props });
    await call("start", { runId: "r1" }, "n");
    await call("end");
    expect(host.seen.map((entry) => entry.op)).toContain("release");
    const bare = await createTestDO(SessionDO, host.env, { props: { ...props, stateArgs: null } });
    await expect(
      bare.callAs({ callerId: "panel:abc", callerKind: "panel" }, "get", "r1")
    ).rejects.toThrow(/no principal/);
  });
});

describe("SessionDO host paths", () => {
  it("relays only the host's settlement paths, and only for the host", async () => {
    const host = codeHost();
    const { call, callAs } = await createTestDO(SessionDO, host.env, { props });
    await call("settle", "appendAuthorityEvent", ["r1", "authority-requested", { a: 1 }]);
    expect(host.seen.find((entry) => entry.method === "appendAuthorityEvent")!.args).toEqual([
      "r1",
      "authority-requested",
      { a: 1 },
    ]);
    await expect(call("settle", "start", [])).rejects.toThrow(/not a settlement path/);
    await expect(
      callAs({ callerId: PRINCIPAL, callerKind: "panel" }, "settle", "failPendingRun", [])
    ).rejects.toThrow();
  });

  it("relays its lifecycle to the kernel only once it has hosted one, and ends the hold at release", async () => {
    const host = codeHost();
    const { call, instance } = await createTestDO(SessionDO, host.env, { props });
    const input = { epoch: "e1", mode: "retire" as const, reason: "t", deadlineMs: 0 };
    await instance.releaseForLifecycle({ ...input, phase: "quiesce" });
    // Nothing was hosted: nothing to tell.
    expect(host.seen).toHaveLength(0);
    await call("start", { runId: "r1" }, "n");
    await instance.releaseForLifecycle({ ...input, phase: "peer-obligations" });
    await instance.releaseForLifecycle({ ...input, phase: "release" });
    const lifecycle = host.seen.filter((entry) => entry.method === "lifecycle");
    expect(lifecycle.map((entry) => (entry.args![0] as { phase: string }).phase)).toEqual([
      "peer-obligations",
      "release",
    ]);
    expect(host.seen.at(-1)!.op).toBe("release");
  });
});

describe("SessionDO channel traffic", () => {
  it("relays a channel's delivery, invocation and cancellation to the kernel that holds the resident sessions", async () => {
    const host = codeHost();
    const { call, callAs } = await createTestDO(SessionDO, host.env, { props });
    const delivery = { channelId: "c1", channelRef: { objectKey: "c1" } };
    const code = { callerId: "do:workers/agent:Agent:a", callerKind: "do" } as const;
    await call("acceptChannelDelivery", delivery);
    await callAs(code, "acceptChannelInvocation", { channelId: "c1", message: {} });
    await callAs(code, "cancelChannelInvocation", { channelId: "c1", message: {} });
    const byMethod = (method: string) => host.seen.find((entry) => entry.method === method)!;
    // The sender is the entity's own caller: the kernel checks it against the channel it registered.
    expect(byMethod("relayChannelDelivery").args).toEqual([
      delivery,
      expect.objectContaining({ kind: "server" }),
    ]);
    expect(byMethod("relayChannelInvocation")).toBeDefined();
    expect(byMethod("relayChannelCancellation")).toBeDefined();
  });
});
