// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { encodeChannelSubscriptionRecord } from "@vibestudio/service-schemas/channel";
import { useForkLineage, type UseForkLineageOptions } from "./useForkLineage";

function harness() {
  const reconnectHandlers = new Set<() => void>();
  const client = {
    onReconnect(handler: () => void) {
      reconnectHandlers.add(handler);
      return () => reconnectHandlers.delete(handler);
    },
  } as NonNullable<UseForkLineageOptions["client"]>;
  let head = 2;
  let label = "Before disconnect";
  let failRead = false;
  const streams: Array<{
    controller: ReadableStreamDefaultController<Uint8Array>;
    signal: AbortSignal;
  }> = [];
  const stream = vi.fn<NonNullable<UseForkLineageOptions["rpc"]["stream"]>>(
    async (_target, _method, _args, options) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          streams.push({ controller, signal: options!.signal! });
          controller.enqueue(encodeChannelSubscriptionRecord({ kind: "subscribed", result: {} }));
        },
      });
      return new Response(body);
    }
  );
  const rpc: UseForkLineageOptions["rpc"] = {
    selfId: "panel-1",
    stream,
    call: async <Result,>(_target: string, method: string, args: unknown[]) => {
      if (method === "workers.resolveService") return { targetId: `do:${args[1]}` } as Result;
      if (method === "getProvenance") return { kind: "root" } as Result;
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
        } as Result;
      }
      throw new Error(`unexpected ${method}`);
    },
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
    stream,
    streams,
    reconnectHandlers,
    reconnect() {
      for (const handler of reconnectHandlers) handler();
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
  it("reopens an idle disconnected subscription, reloads durable state, and receives new heads", async () => {
    const h = harness();
    try {
      await waitFor(() => expect(h.stream).toHaveBeenCalledTimes(1));
      await act(async () =>
        h.streams[0]!.controller.error(new Error("ConnectionLost(ApplicationClosed)"))
      );
      await waitFor(() =>
        expect(h.result.current.error).toContain("Live fork updates disconnected")
      );
      h.updateSnapshot();
      await act(async () => h.reconnect());
      await waitFor(() => expect(h.stream).toHaveBeenCalledTimes(2));
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
    } finally {
      h.dispose();
    }
    expect(h.reconnectHandlers.size).toBe(0);
    expect(h.streams.every(({ signal }) => signal.aborted)).toBe(true);
  });

  it("ignores a late failure from the old stream after recovery", async () => {
    const h = harness();
    try {
      await waitFor(() => expect(h.stream).toHaveBeenCalledTimes(1));
      await act(async () => h.reconnect());
      await waitFor(() => expect(h.stream).toHaveBeenCalledTimes(2));
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
      await waitFor(() => expect(h.stream).toHaveBeenCalledTimes(1));
      h.failRead(true);
      await act(async () => h.reconnect());
      await waitFor(() => expect(h.result.current.error).toContain("snapshot unavailable"));
      h.failRead(false);
      await act(async () => h.reconnect());
      await waitFor(() => expect(h.result.current.error).toBeUndefined());
      act(() =>
        h.result.current.actions.reportError("Could not save", new Error("storage unavailable"))
      );
      await act(async () => h.reconnect());
      await waitFor(() => expect(h.stream).toHaveBeenCalledTimes(4));
      expect(h.result.current.error).toBe("Could not save: storage unavailable");
    } finally {
      h.dispose();
    }
  });
});
