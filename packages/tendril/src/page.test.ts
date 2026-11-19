import { describe, expect, it, vi } from "vitest";
import { connectTendril, type TendrilPageRuntime } from "./page.js";
import { TENDRIL_STATE_SIGNAL } from "./protocol.js";

type Pushed = { type: string; payload?: unknown; contentType?: string; content?: string; senderId?: string };

function fakeChannel(roster: Record<string, { metadata: Record<string, unknown> }>) {
  const queue: Pushed[] = [];
  let wake: (() => void) | null = null;
  const published: { type: string; payload: any; idempotencyKey?: string }[] = [];
  const sent: { text: string; metadata?: unknown }[] = [];
  const reconnects: (() => void)[] = [];
  let online = true;
  const client = {
    roster,
    async ready() {},
    async publish(type: string, payload: unknown, opts?: { idempotencyKey?: string }) {
      if (!online) throw new Error("offline");
      published.push({ type, payload, ...(opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}) });
      return 1;
    },
    async send(text: string, opts?: { metadata?: unknown }) {
      sent.push({ text, metadata: opts?.metadata });
      return { messageId: "m", pubsubId: 1 };
    },
    onReconnect(fn: () => void) {
      reconnects.push(fn);
      return () => {};
    },
    onRoster() {
      return () => {};
    },
    events({ signal }: { signal: AbortSignal }) {
      return (async function* () {
        while (!signal.aborted) {
          while (queue.length) yield queue.shift()!;
          await new Promise<void>((resolve) => {
            wake = resolve;
            signal.addEventListener("abort", () => resolve(), { once: true });
          });
        }
      })();
    },
    async close() {},
  };
  return {
    client,
    published,
    sent,
    emit(event: Pushed) {
      queue.push(event);
      wake?.();
    },
    setOnline(value: boolean) {
      online = value;
      if (value) for (const fn of reconnects) fn();
    },
  };
}

function fakeRuntime(opts: { proof?: unknown[] } = {}) {
  const channel = fakeChannel({ "agent:one": { metadata: { type: "agent" } } });
  let rev = 0;
  let state: Record<string, unknown> = { greeting: "hi" };
  const doCalls: { name: string; args: unknown[] }[] = [];
  const exposed = new Map<string, (request: { args: unknown[] }) => unknown>();
  const rt: TendrilPageRuntime = {
    rpc: {
      selfId: "panel:self",
      async call(_target: string, method: { name: string }, args: unknown[]) {
        doCalls.push({ name: method.name, args });
        switch (method.name) {
          case "getState":
            return { rev, state };
          case "applyState":
            rev += 1;
            return { rev };
          case "panelRuntime.historyProof":
            return opts.proof ?? [];
          case "blobstore.putBase64":
            return { digest: "sha256:abc", size: 3 };
          case "extensions.invoke":
            return { ready: false };
          default:
            return undefined;
        }
      },
      expose(method: string, handler: (request: { args: unknown[] }) => unknown) {
        exposed.set(method, handler);
      },
      stream: async () => {
        throw new Error("no streams in this fake");
      },
    } as unknown as TendrilPageRuntime["rpc"],
    panel: {
      slotId: "slot-1",
      entityId: "entity-2",
      stateArgs: { get: () => ({ tendril: { tendrilId: "t-1", channelId: "chan", contextId: "ctx" } }) },
      getInfo: async () => ({ device: { id: "device-phone", label: "Phone", platform: "mobile" as const } }),
    },
    connect: () => channel.client as never,
    storage: null,
    window: null,
  };
  return {
    rt,
    channel,
    doCalls,
    exposed,
    setServer(next: { rev: number; state: Record<string, unknown> }) {
      rev = next.rev;
      state = next.state;
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("connectTendril", () => {
  it("joins as a presentation of its tendril with the host's device", async () => {
    const f = fakeRuntime();
    const t = await connectTendril(f.rt);
    expect(t.device).toEqual({ id: "device-phone", label: "Phone", platform: "mobile" });
    expect(t.state.get("greeting")).toBe("hi");
    expect(f.doCalls.find((c) => c.name === "registerPresentation")?.args).toEqual([
      { slotId: "slot-1", deviceId: "device-phone", label: "Phone" },
    ]);
    expect([...f.exposed.keys()].sort()).toEqual([
      "tendril.console",
      "tendril.eval",
      "tendril.fn",
      "tendril.snapshot",
    ]);
    expect(t.agent.status()).toEqual({ state: "idle", withheld: 0 });
    await t.close();
  });

  it("sends events idempotently, records without waking, and queues while offline", async () => {
    const f = fakeRuntime();
    const t = await connectTendril(f.rt);
    expect(await t.send({ tap: "stop" })).toEqual({ queued: false });
    await t.send({ speed: 31 }, { wake: false });
    const [event, recorded] = f.channel.published;
    expect(event).toMatchObject({
      type: "tendril.event",
      payload: { tendrilId: "t-1", slotId: "slot-1", deviceId: "device-phone", data: { tap: "stop" } },
    });
    expect(event!.idempotencyKey).toBe(event!.payload.cid);
    expect(recorded!.type).toBe("tendril.record");

    f.channel.setOnline(false);
    expect(await t.send({ n: 1 })).toEqual({ queued: true });
    expect(t.outbox.size).toBe(1);
    f.channel.setOnline(true);
    await tick();
    expect(t.outbox.size).toBe(0);
    expect(f.channel.published.at(-1)!.payload.data).toEqual({ n: 1 });
    await t.close();
  });

  it("applies its own writes at once and other writers' live signals in order", async () => {
    const f = fakeRuntime();
    const t = await connectTendril(f.rt);
    const seen: unknown[] = [];
    t.state.on((state) => seen.push(state["count"]));
    t.state.set("count", 1);
    expect(t.state.get("count")).toBe(1);
    await tick();
    expect(f.doCalls.find((c) => c.name === "applyState")?.args[0]).toMatchObject({
      ops: [{ op: "set", path: ["count"], value: 1 }],
    });
    // Our write was rev 1; another writer's rev 2 arrives live.
    f.channel.emit({
      type: "signal",
      contentType: TENDRIL_STATE_SIGNAL,
      content: JSON.stringify({ tendrilId: "t-1", rev: 2, ops: [{ op: "set", path: ["count"], value: 5 }], by: "agent" }),
    });
    await tick();
    expect(t.state.get("count")).toBe(5);
    // A gap means a missed signal: the page takes the snapshot.
    f.setServer({ rev: 9, state: { count: 9 } });
    f.channel.emit({
      type: "signal",
      contentType: TENDRIL_STATE_SIGNAL,
      content: JSON.stringify({ tendrilId: "t-1", rev: 9, ops: [], by: "agent" }),
    });
    await tick();
    await tick();
    expect(t.state.get("count")).toBe(9);
    expect(seen).toContain(1);
    await t.close();
  });

  it("tracks the agent's turns and what its wake bound withheld", async () => {
    const f = fakeRuntime();
    const t = await connectTendril(f.rt);
    const statuses: unknown[] = [];
    t.agent.on((s) => statuses.push({ ...s }));
    f.channel.emit({ type: "agentic.trajectory.v1/event", senderId: "agent:one", payload: { kind: "turn.opened" } });
    f.channel.emit({ type: "signal", contentType: "agent.observations-withheld", content: JSON.stringify({ count: 3, payloadKinds: ["tendril.event"] }) });
    f.channel.emit({ type: "agentic.trajectory.v1/event", senderId: "agent:one", payload: { kind: "turn.closed" } });
    await tick();
    expect(t.agent.status()).toEqual({ state: "idle", withheld: 3 });
    await t.instruct("slow down", "voice");
    expect(f.channel.sent).toEqual([
      {
        text: "slow down",
        metadata: { tendril: { tendrilId: "t-1", slotId: "slot-1", deviceId: "device-phone", via: "voice" } },
      },
    ]);
    expect(t.agent.status().withheld).toBe(0);
    expect(statuses[0]).toEqual({ state: "working", withheld: 0 });
    await t.close();
  });

  it("exposes page functions to the agent and runs agent code in the page", async () => {
    const f = fakeRuntime();
    const t = await connectTendril(f.rt);
    t.expose("stop", { description: "Stop the timer", phrases: ["stop"] }, (args) => ({ stopped: true, args }));
    await tick();
    expect(f.doCalls.find((c) => c.name === "registerFunctions")?.args).toEqual([
      "slot-1",
      [{ name: "stop", description: "Stop the timer", phrases: ["stop"] }],
    ]);
    await expect(f.exposed.get("tendril.fn")!({ args: [{ name: "stop", args: { x: 1 } }] })).resolves.toEqual({
      stopped: true,
      args: { x: 1 },
    });
    await expect(f.exposed.get("tendril.eval")!({ args: [{ code: "tendril.state.get('greeting')" }] })).resolves.toMatchObject({
      ok: true,
      value: "hi",
    });
    await expect(f.exposed.get("tendril.eval")!({ args: [{ code: "console.log('x'); throw new Error('boom')" }] })).resolves.toMatchObject({
      ok: false,
      error: { message: "boom" },
      console: [{ level: "log", text: "x" }],
    });
    await t.close();
  });

  it("tells the agent once about an update the host reverted", async () => {
    const proof = [
      { entityId: "entity-3", buildKey: "build-new", state: "failed", failure: { code: "boot_stalled", message: "never rendered" } },
      { entityId: "entity-2", buildKey: "build-old", state: "proven", failure: null },
    ];
    const f = fakeRuntime({ proof });
    const t = await connectTendril(f.rt);
    await tick();
    await tick();
    const feedback = f.channel.published.filter((p) => p.type === "agentic.trajectory.v1/event");
    expect(feedback).toHaveLength(1);
    expect(feedback[0]!.payload).toMatchObject({
      kind: "ui.feedback",
      payload: {
        target: { kind: "agent", participantId: "agent:one" },
        error: { message: expect.stringContaining("boot_stalled") },
        occurrenceKey: expect.stringMatching(/^tendril:build-new:/),
      },
    });
    expect(feedback[0]!.idempotencyKey).toBe(`ui-feedback:${feedback[0]!.payload.payload.occurrenceKey}`);
    await t.close();
  });

  it("uploads bytes to the blobstore and returns a reference", async () => {
    const f = fakeRuntime();
    const t = await connectTendril(f.rt);
    const ref = await t.upload(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), { name: "a.png" });
    expect(ref).toEqual({ id: "sha256:abc", mimeType: "image/png", name: "a.png", size: 3 });
    await t.close();
  });

  it("uses the shell's device bridge when the host grants it", async () => {
    const f = fakeRuntime();
    const calls: unknown[] = [];
    f.rt.window = {
      __vibestudioShell: {
        device: {
          capabilities: async () => ["keepAwake", "haptic", "speak"],
          keepAwake: async (on: boolean) => void calls.push(["keepAwake", on]),
          haptic: async (kind: string) => void calls.push(["haptic", kind]),
          speak: async (o: unknown) => void calls.push(["speak", o]),
        },
      },
      addEventListener() {},
      removeEventListener() {},
      navigator: {},
    } as never;
    const t = await connectTendril(f.rt);
    expect(t.native.supported).toEqual(["keepAwake", "haptic", "speak"]);
    await t.native.keepAwake(true);
    await t.native.speak("Turn left", { lang: "en-GB" });
    expect(calls).toEqual([
      ["keepAwake", true],
      ["speak", { text: "Turn left", lang: "en-GB" }],
    ]);
    await t.close();
  });

  it("says plainly when it cannot listen", async () => {
    const f = fakeRuntime();
    const t = await connectTendril(f.rt);
    await expect(t.listen()).rejects.toThrow("cannot record audio");
    await t.close();
    const g = fakeRuntime();
    g.rt.window = {
      addEventListener() {},
      removeEventListener() {},
      navigator: { mediaDevices: { getUserMedia: async () => ({}) } },
    } as never;
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = class {};
    try {
      const u = await connectTendril(g.rt);
      await expect(u.listen()).rejects.toThrow("not prepared");
      await u.close();
    } finally {
      delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
    }
  });

  it("refuses to run in a panel that is not a tendril", async () => {
    const f = fakeRuntime();
    f.rt.panel = { ...f.rt.panel, stateArgs: { get: () => ({}) } };
    await expect(connectTendril(f.rt)).rejects.toThrow("not a tendril");
    vi.restoreAllMocks();
  });
});
