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

function fixture() {
  const forks = [fork("a", "agent-1")];
  const streams: Array<{ controller: ReadableStreamDefaultController<Uint8Array>; signal: AbortSignal }> = [];
  const rpc: ForkLineageRpc = {
    ...schemaRpcMock({
      stream: async (_target: string, _method: string, _args: unknown[], options?: { signal?: AbortSignal }) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              streams.push({ controller, signal: options!.signal! });
              controller.enqueue(encodeChannelSubscriptionRecord({ kind: "subscribed", result: {} }));
            },
          })
        ),
      call: async (_target: string, method: string, args: unknown[]) => {
        if (method === "workers.resolveService") return service(String(args[1]));
        if (method === "getProvenance") return { kind: "root" };
        if (method === "listForks") return { headSeq: 10, forks: [...forks] };
        throw new Error(`unexpected ${method}`);
      },
    }),
    selfId: "panel-1",
  };
  const reconnects = new Set<() => void>();
  const client = {
    onReconnect(handler: () => void) {
      reconnects.add(handler);
      return () => reconnects.delete(handler);
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
  const store = new ForkLineageStore({ rpc, channelId: "root", contextId: "root-context" });
  return { store, rpc, streams, client, reconnects, nav, forks };
}

describe("ForkLineageStore", () => {
  it("loads provenance and children, badges unread forks, and advances the read cursor", async () => {
    const f = fixture();
    const release = f.store.retain();
    f.store.setInputs({ client: f.client, selfId: "panel-1", replaySettled: true, nav: f.nav });
    await until(() => f.store.getSnapshot().children.length === 1);
    const snapshot = f.store.getSnapshot();
    expect(snapshot.provenance).toEqual({ kind: "root" });
    expect(snapshot.currentLabel).toBe("Main");
    expect(snapshot.children[0]).toMatchObject({ channelId: "channel-a", headSeq: 3, unread: true });
    await until(() => f.nav.markForkRead.mock.calls.length > 0);
    expect(f.nav.markForkRead).toHaveBeenCalledWith("root", 10);
    // Snapshot identity is stable while nothing changes.
    expect(f.store.getSnapshot()).toBe(f.store.getSnapshot());
    release();
    expect(f.reconnects.size).toBe(0);
  });

  it("applies live head signals and resubscribes only on client reconnect", async () => {
    const f = fixture();
    const release = f.store.retain();
    f.store.setInputs({ client: f.client, selfId: "panel-1", replaySettled: true, nav: f.nav });
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

    for (const handler of f.reconnects) handler();
    await until(() => f.streams.length === 2);
    expect(f.streams[0]!.signal.aborted).toBe(true);
    release();
    expect(f.streams.every(({ signal }) => signal.aborted)).toBe(true);
  });

  it("notifies only forks that appear after the first durable roster, and not our own", async () => {
    const f = fixture();
    const release = f.store.retain();
    f.store.setInputs({ client: f.client, selfId: "panel-1", replaySettled: true, nav: f.nav });
    await until(() => f.store.getSnapshot().children.length === 1);
    expect(f.nav.onExternalFork).not.toHaveBeenCalled();
    f.forks.push(fork("b", "agent-2"), fork("c", "panel-1"));
    f.store.refresh();
    await until(() => f.store.getSnapshot().children.length === 3);
    expect(f.nav.onExternalFork).toHaveBeenCalledTimes(1);
    expect(f.nav.onExternalFork).toHaveBeenCalledWith(
      expect.objectContaining({ forkedChannelId: "channel-b", forkedContextId: "context-b" })
    );
    release();
  });

  it("reports a stopped live stream and resumes it on retryLiveUpdates", async () => {
    const f = fixture();
    const release = f.store.retain();
    f.store.setInputs({ client: f.client, selfId: "panel-1", replaySettled: true, nav: f.nav });
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
    f.store.setInputs({ client: f.client, selfId: "panel-1", replaySettled: true });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(f.store.getSnapshot()).toBe(initial);
    expect(f.streams).toHaveLength(0);
    release();
  });
});
