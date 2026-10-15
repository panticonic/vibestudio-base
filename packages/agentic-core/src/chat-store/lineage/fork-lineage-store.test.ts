import { describe, expect, it, vi } from "vitest";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { encodeChannelSubscriptionRecord } from "@vibestudio/service-schemas/channel";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";
import { ForkLineageStore, type ForkLineageRpc } from "./fork-lineage-store.js";
import type { ForkNavHandlers } from "./types.js";

function service(channelId: string) {
  return durableObjectServiceFixture(`do:workers/pubsub-channel:PubSubChannel:${channelId}`, {
    name: "pubsub-channel",
    source: "workers/pubsub-channel",
    className: "PubSubChannel",
    objectKey: channelId,
    protocols: ["vibestudio.channel.v1"],
  });
}

function fork(id: string, actorId: string, headSeq = 3) {
  return {
    parentChannelId: "root",
    forkId: id,
    forkedChannelId: `channel-${id}`,
    forkedContextId: `context-${id}`,
    label: `Fork ${id}`,
    reason: "fork",
    actor: { kind: "agent" as const, id: actorId },
    forkPointId: 1,
    createdAtSeq: 2,
    headSeq,
    archived: false,
  };
}

async function until(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("condition not reached");
}

function fixture(
  options: {
    abortStream?: (
      controller: ReadableStreamDefaultController<Uint8Array>,
      signal: AbortSignal
    ) => void;
  } = {}
) {
  const { abortStream } = options;
  const forks = [fork("a", "agent-1")];
  let resolveGate: ((signal: AbortSignal | undefined) => Promise<void>) | undefined;
  const streams: Array<{
    controller: ReadableStreamDefaultController<Uint8Array>;
    signal: AbortSignal;
  }> = [];
  const rpc: ForkLineageRpc = {
    ...schemaRpcMock({
      streamReadable: async (
        _target: string,
        _method: string,
        _args: unknown[],
        options?: { signal?: AbortSignal }
      ) => ({
        status: 200,
        statusText: "OK",
        headers: [],
        finalUrl: "",
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            const signal = options!.signal!;
            streams.push({ controller, signal });
            signal.addEventListener(
              "abort",
              () => {
                if (abortStream) abortStream(controller, signal);
                else controller.error(signal.reason);
              },
              { once: true }
            );
            controller.enqueue(
              encodeChannelSubscriptionRecord({
                kind: "subscribed",
                result: {},
              })
            );
          },
        }),
      }),
      call: async (
        _target: string,
        method: string,
        args: unknown[],
        callOptions?: { signal?: AbortSignal }
      ) => {
        if (method === "workers.resolveService") {
          await resolveGate?.(callOptions?.signal);
          return service(String(args[1]));
        }
        if (method === "getProvenance") return { kind: "root" };
        if (method === "listForks") return { headSeq: 10, forks: [...forks] };
        throw new Error(`unexpected ${method}`);
      },
    }),
    selfId: "panel-1",
  };
  const disconnects = new Set<() => void>();
  const ready = new Set<() => void>();
  let connected = true;
  const client = {
    get connected() {
      return connected;
    },
    onDisconnect(handler: () => void) {
      disconnects.add(handler);
      return () => disconnects.delete(handler);
    },
    onReady(handler: () => void) {
      ready.add(handler);
      return () => ready.delete(handler);
    },
  };
  const cursors: Record<string, number> = { "channel-a": 1 };
  const nav = {
    switchTo: vi.fn(),
    openInNewPanel: vi.fn(),
    readForkCursors: () => ({ ...cursors }),
    markForkRead: vi.fn(async (channelId: string, headSeq: number) => {
      cursors[channelId] = headSeq;
    }),
    onExternalFork: vi.fn(),
  } satisfies ForkNavHandlers;
  const store = new ForkLineageStore({
    rpc,
    channelId: "root",
    contextId: "root-context",
  });
  return {
    store,
    rpc,
    streams,
    client,
    disconnects,
    ready,
    nav,
    forks,
    disconnect() {
      connected = false;
      for (const handler of disconnects) handler();
    },
    reconnect() {
      connected = false;
      for (const handler of disconnects) handler();
      connected = true;
      for (const handler of ready) handler();
    },
    settleReplay() {
      connected = true;
      for (const handler of ready) handler();
    },
    blockResolution(gate: typeof resolveGate) {
      resolveGate = gate;
    },
  };
}

describe("ForkLineageStore", () => {
  it("uses replay readiness when bound during recovery and opens only one generation", async () => {
    const f = fixture();
    f.disconnect();
    const release = f.store.retain();
    try {
      f.store.setInputs({
        client: f.client,
        selfId: "panel-1",
        replaySettled: false,
        nav: f.nav,
      });
      await until(() => f.store.getSnapshot().children.length === 1);
      expect(f.streams).toHaveLength(0);
      f.settleReplay();
      await until(() => f.streams.length === 1);
      f.settleReplay();
      await Promise.resolve();
      expect(f.streams).toHaveLength(1);
    } finally {
      release();
    }
  });

  it("does not open a dependent stream until an initially disconnected session reconnects", async () => {
    const f = fixture();
    f.disconnect();
    f.blockResolution(async () => {
      if (!f.client.connected)
        throw Object.assign(new Error("offline"), {
          code: "CONNECTION_LOST",
          errorKind: "transport",
        });
    });
    const release = f.store.retain();
    try {
      f.store.setInputs({
        client: f.client,
        selfId: "panel-1",
        replaySettled: true,
        nav: f.nav,
      });
      await until(() => f.store.getSnapshot().error !== undefined);
      expect(f.streams).toHaveLength(0);
      f.reconnect();
      await until(() => f.streams.length === 1 && f.store.getSnapshot().children.length === 1);
    } finally {
      release();
    }
    expect(f.disconnects.size).toBe(0);
    expect(f.ready.size).toBe(0);
    expect(f.streams[0]!.signal.aborted).toBe(true);
  });

  it.each(["body-first", "disconnect-first"] as const)(
    "retires typed connection loss without a warning (%s) and receives recovered heads",
    async (order) => {
      const f = fixture();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const release = f.store.retain();
      try {
        f.store.setInputs({
          client: f.client,
          selfId: "panel-1",
          replaySettled: true,
          nav: f.nav,
        });
        await until(() => f.streams.length === 1 && f.store.getSnapshot().children.length === 1);
        const lost = Object.assign(new Error("logical session retired"), {
          code: "CONNECTION_LOST",
          errorKind: "transport",
        });
        if (order === "body-first") {
          f.streams[0]!.controller.error(lost);
          await until(() => f.store.getSnapshot().liveUpdatesInterrupted === true);
          f.store.getSnapshot().actions.retryLiveUpdates!();
          await Promise.resolve();
          expect(f.streams).toHaveLength(1);
          f.disconnect();
        } else {
          f.disconnect();
          f.streams[0]!.controller.error(lost);
        }
        expect(f.streams[0]!.signal.aborted).toBe(true);
        expect(f.streams).toHaveLength(1);
        f.reconnect();
        await until(() => f.streams.length === 2 && !f.store.getSnapshot().liveUpdatesInterrupted);
        f.streams[1]!.controller.enqueue(
          encodeChannelSubscriptionRecord({
            kind: "message",
            payload: {
              kind: "signal",
              payload: {
                contentType: "fork.head_changed",
                content: JSON.stringify({
                  channelId: "channel-a",
                  headSeq: 23,
                }),
              },
            },
          })
        );
        await until(() => f.store.getSnapshot().children[0]?.headSeq === 23);
        expect(warn).not.toHaveBeenCalled();
      } finally {
        release();
        warn.mockRestore();
      }
    }
  );

  it("joins the old pending read before subscribing its replacement", async () => {
    let retire!: () => void;
    const f = fixture({
      abortStream(controller, signal) {
        retire = () => controller.error(signal.reason);
      },
    });
    const release = f.store.retain();
    try {
      f.store.setInputs({
        client: f.client,
        selfId: "panel-1",
        replaySettled: true,
        nav: f.nav,
      });
      await until(() => f.streams.length === 1 && f.store.getSnapshot().children.length === 1);
      f.reconnect();
      expect(f.streams[0]!.signal.aborted).toBe(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(f.streams).toHaveLength(1);
      retire();
      await until(() => f.streams.length === 2);
    } finally {
      release();
      retire();
    }
  });

  it("cancels and joins pending target resolution before reconnecting", async () => {
    const f = fixture();
    let resolving: AbortSignal | undefined;
    const release = f.store.retain();
    try {
      f.store.setInputs({
        client: f.client,
        selfId: "panel-1",
        replaySettled: true,
        nav: f.nav,
      });
      await until(() => f.streams.length === 1 && f.store.getSnapshot().children.length === 1);
      f.blockResolution(
        (signal) =>
          new Promise<void>((_resolve, reject) => {
            resolving = signal;
            signal!.addEventListener("abort", () => reject(signal!.reason), {
              once: true,
            });
          })
      );
      f.reconnect();
      await until(() => resolving !== undefined);
      f.disconnect();
      expect(resolving!.aborted).toBe(true);
      f.blockResolution(undefined);
      f.reconnect();
      await until(() => f.streams.length === 2);
    } finally {
      release();
    }
  });

  it("retains an independent retirement failure without letting it mutate its successor", async () => {
    let failRetirement!: () => void;
    let first = true;
    const cleanup = new Error("independent cleanup failure");
    const f = fixture({
      abortStream(controller, signal) {
        if (first) {
          first = false;
          failRetirement = () =>
            controller.error(new AggregateError([signal.reason, cleanup], "retirement failed"));
        } else controller.error(signal.reason);
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const release = f.store.retain();
    try {
      f.store.setInputs({
        client: f.client,
        selfId: "panel-1",
        replaySettled: true,
        nav: f.nav,
      });
      await until(() => f.streams.length === 1 && f.store.getSnapshot().children.length === 1);
      f.reconnect();
      failRetirement();
      await until(() => f.streams.length === 2);
      expect(warn).toHaveBeenCalledOnce();
      const failure = warn.mock.calls[0]![1] as AggregateError;
      expect(failure.errors).toContain(cleanup);
      expect(f.store.getSnapshot().error).toBeUndefined();
    } finally {
      release();
      failRetirement();
      warn.mockRestore();
    }
  });

  it("joins both snapshot reads and retains an independent cleanup failure during release", async () => {
    const f = fixture();
    const signals: AbortSignal[] = [];
    const failures: unknown[] = [];
    const cleanup = new Error("snapshot cleanup failed");
    f.blockResolution(
      (signal) =>
        new Promise<void>((_resolve, reject) => {
          const index = signals.length;
          signals.push(signal!);
          signal!.addEventListener(
            "abort",
            () => {
              const failure =
                index === 0
                  ? signal!.reason
                  : new AggregateError([signal!.reason, cleanup], "snapshot retirement failed");
              failures[index] = failure;
              reject(failure);
            },
            { once: true }
          );
        })
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const release = f.store.retain();
    try {
      f.store.setInputs({ client: f.client, selfId: "panel-1", replaySettled: true, nav: f.nav });
      await until(() => signals.length === 2);
      release();
      await until(() => warn.mock.calls.length === 1);
      expect(signals.every((signal) => signal.aborted)).toBe(true);
      expect(failures).toHaveLength(2);
      const aggregate = warn.mock.calls[0]![1] as AggregateError;
      expect(aggregate.errors).toEqual(failures);
      expect((aggregate.errors[1] as AggregateError).errors).toContain(cleanup);
      expect(f.ready.size).toBe(0);
      expect(f.disconnects.size).toBe(0);
    } finally {
      release();
      warn.mockRestore();
    }
  });

  it.each([
    () => new Error("Reset(514)"),
    () =>
      new AggregateError(
        [
          Object.assign(new Error("logical session retired"), {
            code: "CONNECTION_LOST",
            errorKind: "transport",
          }),
          new Error("independent reader cleanup failed"),
        ],
        "stream and cleanup failed"
      ),
  ])(
    "keeps untyped or mixed application failures visible with the exact cause",
    async (failure) => {
      const f = fixture();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const release = f.store.retain();
      try {
        f.store.setInputs({
          client: f.client,
          selfId: "panel-1",
          replaySettled: true,
          nav: f.nav,
        });
        await until(() => f.streams.length === 1 && f.store.getSnapshot().children.length === 1);
        const cause = failure();
        f.streams[0]!.controller.error(cause);
        await until(() => f.store.getSnapshot().liveUpdatesInterrupted === true);
        expect(warn).toHaveBeenCalledWith("[ForkLineageStore] live fork updates stopped:", cause);
        expect(f.store.getSnapshot().error).toContain("until you retry");
      } finally {
        release();
        warn.mockRestore();
      }
    }
  );

  it("loads provenance and children, badges unread forks, and advances the read cursor", async () => {
    const f = fixture();
    const release = f.store.retain();
    f.store.setInputs({
      client: f.client,
      selfId: "panel-1",
      replaySettled: true,
      nav: f.nav,
    });
    await until(() => f.store.getSnapshot().children.length === 1);
    const snapshot = f.store.getSnapshot();
    expect(snapshot.provenance).toEqual({ kind: "root" });
    expect(snapshot.currentLabel).toBe("Main");
    expect(snapshot.children[0]).toMatchObject({
      channelId: "channel-a",
      headSeq: 3,
      unread: true,
    });
    await until(() => f.nav.markForkRead.mock.calls.length > 0);
    expect(f.nav.markForkRead).toHaveBeenCalledWith("root", 10);
    // Snapshot identity is stable while nothing changes.
    expect(f.store.getSnapshot()).toBe(f.store.getSnapshot());
    release();
    expect(f.ready.size).toBe(0);
    expect(f.disconnects.size).toBe(0);
  });

  it("applies live head signals and resubscribes when the recovered client is ready", async () => {
    const f = fixture();
    const release = f.store.retain();
    f.store.setInputs({
      client: f.client,
      selfId: "panel-1",
      replaySettled: true,
      nav: f.nav,
    });
    await until(() => f.streams.length === 1 && f.store.getSnapshot().children.length === 1);
    f.streams[0]!.controller.enqueue(
      encodeChannelSubscriptionRecord({
        kind: "message",
        payload: {
          kind: "signal",
          payload: {
            contentType: "fork.head_changed",
            content: JSON.stringify({ channelId: "channel-a", headSeq: 20 }),
          },
        },
      })
    );
    await until(() => f.store.getSnapshot().children[0]?.headSeq === 20);
    expect(f.store.getSnapshot().children[0]?.unread).toBe(true);

    f.reconnect();
    await until(() => f.streams.length === 2);
    expect(f.streams[0]!.signal.aborted).toBe(true);
    release();
    expect(f.streams.every(({ signal }) => signal.aborted)).toBe(true);
  });

  it("notifies only forks that appear after the first durable roster, and not our own", async () => {
    const f = fixture();
    const release = f.store.retain();
    f.store.setInputs({
      client: f.client,
      selfId: "panel-1",
      replaySettled: true,
      nav: f.nav,
    });
    await until(() => f.store.getSnapshot().children.length === 1);
    expect(f.nav.onExternalFork).not.toHaveBeenCalled();
    f.forks.push(fork("b", "agent-2"), fork("c", "panel-1"));
    f.store.refresh();
    await until(() => f.store.getSnapshot().children.length === 3);
    expect(f.nav.onExternalFork).toHaveBeenCalledTimes(1);
    expect(f.nav.onExternalFork).toHaveBeenCalledWith(
      expect.objectContaining({
        forkedChannelId: "channel-b",
        forkedContextId: "context-b",
      })
    );
    release();
  });

  it("recognises the local person by their RPC principal, not only their participant id", async () => {
    const f = fixture();
    const release = f.store.retain();
    // The channel records the RPC principal ("panel-1"); the participant id differs.
    f.store.setInputs({
      client: f.client,
      selfId: "participant-1",
      replaySettled: true,
      nav: f.nav,
    });
    await until(() => f.store.getSnapshot().children.length === 1);
    f.forks.push(fork("mine", "panel-1"));
    f.store.refresh();
    await until(() => f.store.getSnapshot().children.length === 2);
    const mine = f.store.getSnapshot().children.find((entry) => entry.forkId === "mine")!;
    expect(f.store.getSnapshot().presentActor(mine.actor)).toBe("You");
    expect(f.store.getSnapshot().presentActor({ kind: "agent", id: "do:workers/x:Y:key" })).toBe(
      "An agent"
    );
    expect(f.nav.onExternalFork).not.toHaveBeenCalled();
    release();
  });

  it("reports a stopped live stream and resumes it on retryLiveUpdates", async () => {
    const f = fixture();
    const release = f.store.retain();
    f.store.setInputs({
      client: f.client,
      selfId: "panel-1",
      replaySettled: true,
      nav: f.nav,
    });
    await until(() => f.streams.length === 1 && f.store.getSnapshot().children.length === 1);
    f.streams[0]!.controller.error(new Error("socket reset"));
    await until(() => f.store.getSnapshot().liveUpdatesInterrupted === true);
    expect(f.store.getSnapshot().error).toMatch(/Fork updates paused/);
    expect(f.store.getSnapshot().error).not.toMatch(/socket reset/);

    f.store.getSnapshot().actions.retryLiveUpdates!();
    await until(() => f.streams.length === 2);
    await until(() => f.store.getSnapshot().liveUpdatesInterrupted === false);
    expect(f.store.getSnapshot().error).toBeUndefined();
    release();
  });

  it("stays inert without navigation handlers", async () => {
    const f = fixture();
    const release = f.store.retain();
    const initial = f.store.getSnapshot();
    f.store.setInputs({
      client: f.client,
      selfId: "panel-1",
      replaySettled: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(f.store.getSnapshot()).toBe(initial);
    expect(f.streams).toHaveLength(0);
    release();
  });
});
