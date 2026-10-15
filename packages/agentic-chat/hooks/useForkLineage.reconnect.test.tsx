// @vitest-environment jsdom

import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { encodeChannelSubscriptionRecord } from "@vibestudio/service-schemas/channel";
import { useForkLineage, type UseForkLineageOptions } from "./useForkLineage";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";

function resolvedChannelService(channelId: string) {
  return durableObjectServiceFixture(`do:workers/pubsub-channel:PubSubChannel:${channelId}`, {
    name: "pubsub-channel",
    source: "workers/pubsub-channel",
    className: "PubSubChannel",
    objectKey: channelId,
    protocols: ["vibestudio.channel.v1"],
  });
}

function harness(initiallyConnected = true) {
  const readyHandlers = new Set<() => void>();
  const disconnectHandlers = new Set<() => void>();
  let connected = initiallyConnected;
  const client = {
    get connected() {
      return connected;
    },
    onDisconnect(handler: () => void) {
      disconnectHandlers.add(handler);
      return () => disconnectHandlers.delete(handler);
    },
    onReady(handler: () => void) {
      readyHandlers.add(handler);
      return () => readyHandlers.delete(handler);
    },
  } satisfies NonNullable<UseForkLineageOptions["client"]>;
  let head = 2;
  let label = "Before disconnect";
  let failRead = false;
  const streams: Array<{
    controller: ReadableStreamDefaultController<Uint8Array>;
    signal: AbortSignal;
  }> = [];
  const streamReadable = vi.fn<import("@vibestudio/rpc/internal").RpcWireClient["streamReadable"]>(
    async (_target, _method, _args, options) => {
      const signal = options!.signal!;
      let onAbort: () => void;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          streams.push({ controller, signal });
          onAbort = () => controller.error(signal.reason);
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener("abort", onAbort, { once: true });
          controller.enqueue(encodeChannelSubscriptionRecord({ kind: "subscribed", result: {} }));
        },
        cancel() {
          signal.removeEventListener("abort", onAbort);
        },
      });
      return { status: 200, statusText: "OK", headers: [], finalUrl: "", body };
    }
  );
  const rpc: UseForkLineageOptions["rpc"] = {
    ...schemaRpcMock({
      streamReadable,
      call: async (_target: string, method: string, args: unknown[]) => {
        if (method === "workers.resolveService") return resolvedChannelService(String(args[1]));
        if (method === "getProvenance") return { kind: "root" };
        if (method === "listForks") {
          if (failRead) throw new Error("snapshot unavailable");
          return {
            headSeq: 1,
            forks: [
              {
                parentChannelId: "root",
                forkId: "fork-1",
                forkedChannelId: "child",
                forkedContextId: "child-context",
                label,
                reason: "fork",
                actor: { kind: "agent", id: "agent-1" },
                forkPointId: 1,
                createdAtSeq: 2,
                headSeq: head,
                archived: false,
              },
            ],
          };
        }
        throw new Error(`unexpected ${method}`);
      },
    }),
    selfId: "panel-1",
  };
  const mounted = renderHook(() =>
    useForkLineage({
      rpc,
      client,
      channelId: "root",
      selfId: "panel-1",
      messages: [],
      replaySettled: true,
      nav: { switchTo() {}, openInNewPanel() {} },
    })
  );
  return {
    ...mounted,
    streamReadable,
    streams,
    readyHandlers,
    disconnectHandlers,
    client,
    disconnect() {
      connected = false;
      for (const handler of disconnectHandlers) handler();
    },
    ready() {
      connected = true;
      for (const handler of readyHandlers) handler();
    },
    updateSnapshot() {
      head = 9;
      label = "Changed while offline";
    },
    failRead(value: boolean) {
      failRead = value;
    },
    emitHead(index: number, headSeq: number) {
      streams[index]!.controller.enqueue(
        encodeChannelSubscriptionRecord({
          kind: "message",
          payload: {
            kind: "signal",
            payload: {
              contentType: "fork.head_changed",
              content: JSON.stringify({ channelId: "child", headSeq }),
            },
          },
        })
      );
    },
    dispose() {
      mounted.unmount();
      for (const { controller } of streams) {
        try {
          controller.close();
        } catch {
          /* already failed */
        }
      }
    },
  };
}

describe("fork lineage recovery", () => {
  it.each(["before", "after"])(
    "recovers a typed session loss %s the primary disconnect event",
    async (order) => {
      const h = harness();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        await waitFor(() => expect(h.streamReadable).toHaveBeenCalledTimes(1));
        if (order === "after") await act(async () => h.disconnect());
        await act(async () =>
          h.streams[0]!.controller.error(
            Object.assign(new Error("session ended"), {
              code: "CONNECTION_LOST",
              errorKind: "transport",
            })
          )
        );
        if (order === "before") {
          await waitFor(() => expect(h.result.current.error).toContain("Fork updates paused"));
          await act(async () => h.disconnect());
        }
        h.updateSnapshot();
        expect(h.client.connected).toBe(false);
        expect(h.streamReadable).toHaveBeenCalledTimes(1);
        await act(async () => h.ready());
        expect(h.client.connected).toBe(true);
        await waitFor(() => expect(h.streamReadable).toHaveBeenCalledTimes(2));
        await waitFor(() =>
          expect(h.result.current.children[0]).toMatchObject({
            label: "Changed while offline",
            headSeq: 9,
          })
        );
        expect(h.result.current.error).toBeUndefined();
        expect(h.streams[0]!.signal.aborted).toBe(true);
        await act(async () => h.emitHead(1, 12));
        await waitFor(() => expect(h.result.current.children[0]?.headSeq).toBe(12));
        expect(warn).not.toHaveBeenCalled();
      } finally {
        h.dispose();
        warn.mockRestore();
      }
      expect(h.readyHandlers.size).toBe(0);
      expect(h.disconnectHandlers.size).toBe(0);
      expect(h.streams.every(({ signal }) => signal.aborted)).toBe(true);
    }
  );

  it("waits for primary replay readiness when mounted during recovery", async () => {
    const h = harness(false);
    try {
      await waitFor(() => expect(h.readyHandlers.size).toBe(1));
      expect(h.streamReadable).not.toHaveBeenCalled();
      await act(async () => h.ready());
      await waitFor(() => expect(h.streamReadable).toHaveBeenCalledTimes(1));
      await act(async () => h.ready());
      expect(h.streamReadable).toHaveBeenCalledTimes(1);
    } finally {
      h.dispose();
    }
    expect(h.readyHandlers.size).toBe(0);
    expect(h.disconnectHandlers.size).toBe(0);
  });

  it("reports an untyped individual stream reset while still connected", async () => {
    const h = harness();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failure = new Error("Reset(514)");
    try {
      await waitFor(() => expect(h.streamReadable).toHaveBeenCalledTimes(1));
      await act(async () => h.streams[0]!.controller.error(failure));
      await waitFor(() =>
        expect(warn).toHaveBeenCalledWith("[ForkLineageStore] live fork updates stopped:", failure)
      );
      expect(h.client.connected).toBe(true);
      expect(h.result.current.error).toContain("Fork updates paused");
    } finally {
      h.dispose();
      warn.mockRestore();
    }
  });

  it("ignores a late failure from the old stream after recovery", async () => {
    const h = harness();
    try {
      await waitFor(() => expect(h.streamReadable).toHaveBeenCalledTimes(1));
      await act(async () => h.disconnect());
      await act(async () => h.ready());
      await waitFor(() => expect(h.streamReadable).toHaveBeenCalledTimes(2));
      await act(async () =>
        h.streams[0]!.controller.error(new Error("late old connection failure"))
      );
      expect(h.result.current.error).toBeUndefined();
      await act(async () => h.emitHead(1, 7));
      await waitFor(() => expect(h.result.current.children[0]?.headSeq).toBe(7));
    } finally {
      h.dispose();
    }
  });

  it("clears recovered read failures but preserves unrelated action failures", async () => {
    const h = harness();
    try {
      await waitFor(() => expect(h.streamReadable).toHaveBeenCalledTimes(1));
      h.failRead(true);
      await act(async () => h.disconnect());
      await act(async () => h.ready());
      await waitFor(() => expect(h.result.current.error).toContain("snapshot unavailable"));
      h.failRead(false);
      await act(async () => h.disconnect());
      await act(async () => h.ready());
      await waitFor(() => expect(h.result.current.error).toBeUndefined());
      act(() =>
        h.result.current.actions.reportError("Could not save", new Error("storage unavailable"))
      );
      await act(async () => h.disconnect());
      await act(async () => h.ready());
      await waitFor(() => expect(h.streamReadable).toHaveBeenCalledTimes(4));
      expect(h.result.current.error).toBe("Could not save: storage unavailable");
    } finally {
      h.dispose();
    }
  });
});
