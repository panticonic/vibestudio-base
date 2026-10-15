// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  AGENTIC_PROTOCOL_VERSION,
  brandId,
  type AgenticEvent,
  type BlockId,
  type MessageId,
} from "@workspace/agentic-protocol";
import type {
  EventStreamItem,
  IncomingEvent,
  PubSubClient,
} from "@workspace/pubsub";
import type { QuickfireTranscriptEntry } from "./model";
import {
  useQuickfireSessionCore,
  type QuickfireSessionSource,
  type QuickfireTransport,
} from "./session";

function completed(
  id: string,
  content: string,
  role: "user" | "assistant" = "assistant",
  createdAt = "2026-10-12T08:00:00.000Z",
): AgenticEvent<"message.completed"> {
  return {
    kind: "message.completed",
    actor:
      role === "user"
        ? { kind: "user", id: "user:me" }
        : { kind: "agent", id: "agent:quickfire" },
    causality: { messageId: brandId<MessageId>(id) },
    payload: {
      protocol: AGENTIC_PROTOCOL_VERSION,
      role,
      blocks: [
        { blockId: brandId<BlockId>(`${id}:block:0`), type: "text", content },
      ],
      outcome: "completed",
    },
    createdAt,
  };
}

function delta(id: string, text: string): AgenticEvent<"message.delta"> {
  return {
    kind: "message.delta",
    actor: { kind: "agent", id: "agent:quickfire" },
    causality: { messageId: brandId<MessageId>(id) },
    payload: {
      protocol: AGENTIC_PROTOCOL_VERSION,
      blockId: brandId<BlockId>(`${id}:block:0`),
      type: "text",
      text,
    },
    createdAt: "2026-10-12T08:00:01.000Z",
  };
}

function wire(seq: number, payload: AgenticEvent, phase: "replay" | "live") {
  return {
    type: AGENTIC_EVENT_PAYLOAD_KIND,
    delivery: "log",
    phase,
    senderId: payload.actor.id,
    pubsubId: seq,
    ts: Date.parse(payload.createdAt),
    contentClass: "internal",
    externalKeys: [],
    payload,
  } as unknown as IncomingEvent;
}

/** A channel client whose event stream the test drives. */
function fakeClient(options: {
  replay: IncomingEvent[];
  firstEnvelopeSeq?: number;
  hasMoreBefore?: boolean;
  getReplayBefore?: PubSubClient["getReplayBefore"];
}) {
  const queue: EventStreamItem[] = [
    ...options.replay,
    {
      type: "replay-complete",
      delivery: "control",
      generation: 1,
      firstEnvelopeSeq: options.firstEnvelopeSeq,
      hasMoreBefore: options.hasMoreBefore ?? false,
    },
  ];
  let wake: (() => void) | null = null;
  let closed = false;
  const iterator: AsyncIterableIterator<EventStreamItem> = {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      while (queue.length === 0 && !closed) {
        await new Promise<void>((resolve) => (wake = resolve));
      }
      if (closed) return { value: undefined as never, done: true };
      return { value: queue.shift()!, done: false };
    },
    async return() {
      closed = true;
      wake?.();
      return { value: undefined as never, done: true };
    },
  };
  const client = {
    channelId: "quickfire-channel",
    clientId: "slot-1",
    connected: true,
    hasMoreBefore: options.hasMoreBefore ?? false,
    firstEnvelopeSeq: options.firstEnvelopeSeq,
    onReady: vi.fn(() => () => {}),
    ready: vi.fn(async () => {}),
    events: vi.fn(() => iterator),
    getReplayBefore:
      options.getReplayBefore ??
      vi.fn(async () => ({
        mode: "before",
        logEvents: [],
        snapshots: [],
        ready: { totalCount: 0, envelopeCount: 0, hasMoreBefore: false },
      })),
    getReplayAfter: vi.fn(),
    close: vi.fn(async () => {
      closed = true;
      wake?.();
    }),
    send: vi.fn(async () => ({ messageId: "sent", pubsubId: undefined })),
    recordReadReceipt: vi.fn(async () => {}),
  };
  return {
    client: client as unknown as PubSubClient,
    raw: client,
    push(event: IncomingEvent) {
      queue.push(event);
      const resume = wake;
      wake = null;
      resume?.();
    },
  };
}

function fakeTransport(clients: PubSubClient[]): QuickfireTransport {
  let next = 0;
  return {
    loadModelCatalog: vi.fn(),
    sessionFor: vi.fn(async (slotId: string) => ({
      channelId: `channel-${slotId}`,
      channelTargetId: `target-${slotId}`,
      contextId: "ctx",
      state: "resumed" as const,
      messageCount: null,
      lastActivityAt: null,
    })),
    clear: vi.fn(async () => undefined),
    promote: vi.fn(async () => null),
    connectToChannel: vi.fn(() => clients[next++]!),
  };
}

const texts = (entries: readonly QuickfireTranscriptEntry[]) =>
  entries.flatMap((entry) => (entry.kind === "message" ? [entry.text] : []));

describe("useQuickfireSessionCore", () => {
  it("projects the join replay, then live appends and streaming deltas", async () => {
    const channel = fakeClient({
      replay: [wire(1, completed("hello", "Hi", "user"), "replay")],
    });
    const transport = fakeTransport([channel.client]);
    const { result, unmount } = renderHook(() =>
      useQuickfireSessionCore("slot-1", transport),
    );
    await waitFor(() =>
      expect(texts(result.current.view.transcript)).toEqual(["Hi"]),
    );
    expect(result.current.view.connecting).toBe(false);

    await act(async () => {
      channel.push({
        delivery: "signal",
        type: "signal",
        contentType: AGENTIC_EVENT_PAYLOAD_KIND,
        content: JSON.stringify([
          delta("answer", "Hel"),
          delta("answer", "lo"),
        ]),
        ts: Date.parse("2026-10-12T08:00:01.000Z"),
      } as unknown as IncomingEvent);
    });
    // A streaming answer renders as partial text before its durable terminal.
    await waitFor(() =>
      expect(texts(result.current.view.transcript)).toEqual(["Hi", "Hello"]),
    );

    await act(async () => {
      channel.push(
        wire(
          2,
          completed(
            "answer",
            "Hello there",
            "assistant",
            "2026-10-12T08:00:02.000Z",
          ),
          "live",
        ),
      );
    });
    await waitFor(() =>
      expect(texts(result.current.view.transcript)).toEqual([
        "Hi",
        "Hello there",
      ]),
    );
    unmount();
  });

  it("reports a failed send separately and keeps the conversation usable", async () => {
    const channel = fakeClient({ replay: [] });
    channel.raw.send
      .mockRejectedValueOnce(new Error("Delivery rejected"))
      .mockResolvedValue({ messageId: "sent", pubsubId: undefined });
    const transport = fakeTransport([channel.client]);
    const { result, unmount } = renderHook(() =>
      useQuickfireSessionCore("slot-1", transport),
    );
    await waitFor(() => expect(result.current.view.connecting).toBe(false));
    await act(async () => {
      await result.current.send("first try");
    });
    expect(result.current.view.sendError).toBe("Delivery rejected");
    expect(result.current.view.error).toBeNull();
    expect(result.current.view.historyError).toBeNull();
    await act(async () => {
      await result.current.send("second try");
    });
    expect(result.current.view.sendError).toBeNull();
    unmount();
  });

  it("pages durable history from the join anchor and surfaces a failed page", async () => {
    const getReplayBefore = vi
      .fn()
      .mockRejectedValueOnce(new Error("History is unavailable"))
      .mockResolvedValueOnce({
        mode: "before",
        snapshots: [],
        logEvents: [
          {
            id: 3,
            messageId: "env-3",
            type: AGENTIC_EVENT_PAYLOAD_KIND,
            senderId: "user:me",
            ts: 0,
            payload: completed("older", "Older question", "user"),
          },
        ],
        ready: { totalCount: 2, envelopeCount: 2, hasMoreBefore: false },
      });
    const channel = fakeClient({
      // The join replay starts at envelope 5 even though only 7 projects.
      replay: [wire(7, completed("recent", "Recent answer"), "replay")],
      firstEnvelopeSeq: 5,
      hasMoreBefore: true,
      getReplayBefore,
    });
    const { result, unmount } = renderHook(() =>
      useQuickfireSessionCore("slot-1", fakeTransport([channel.client])),
    );
    await waitFor(() =>
      expect(texts(result.current.view.transcript)).toEqual(["Recent answer"]),
    );
    expect(result.current.view.expandable).toBe(true);

    await act(async () => {
      await result.current.showOlder();
    });
    expect(getReplayBefore).toHaveBeenLastCalledWith(5, 500);
    await waitFor(() =>
      expect(result.current.view.historyError).toBe("History is unavailable"),
    );
    // A history failure is not a conversation failure: composing stays enabled.
    expect(result.current.view.error).toBeNull();
    expect(texts(result.current.view.transcript)).toEqual(["Recent answer"]);

    await act(async () => {
      await result.current.showOlder();
    });
    await waitFor(() =>
      expect(texts(result.current.view.transcript)).toEqual([
        "Older question",
        "Recent answer",
      ]),
    );
    expect(result.current.view.historyError).toBeNull();
    expect(result.current.view.expandable).toBe(false);
    unmount();
  });

  it("drops the previous binding's transcript when rebinding to another source", async () => {
    const first = fakeClient({
      replay: [wire(1, completed("a", "First slot"), "replay")],
    });
    const second = fakeClient({
      replay: [wire(1, completed("b", "Second slot"), "replay")],
    });
    const transport = fakeTransport([first.client, second.client]);
    const { result, rerender, unmount } = renderHook(
      ({ source }: { source: string | QuickfireSessionSource }) =>
        useQuickfireSessionCore(source, transport),
      { initialProps: { source: "slot-1" } },
    );
    await waitFor(() =>
      expect(texts(result.current.view.transcript)).toEqual(["First slot"]),
    );

    rerender({ source: "slot-2" });
    await waitFor(() =>
      expect(texts(result.current.view.transcript)).toEqual(["Second slot"]),
    );
    expect(first.raw.close).toHaveBeenCalled();
    // A late event on the retired binding does not reach the new transcript.
    await act(async () => {
      first.push(wire(2, completed("late", "Late first"), "live"));
    });
    expect(texts(result.current.view.transcript)).toEqual(["Second slot"]);
    unmount();
  });
});
