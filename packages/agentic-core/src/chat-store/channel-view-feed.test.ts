import { describe, expect, it, vi } from "vitest";
import {
  AsyncQueue,
  type EventStreamItem,
  type IncomingAgenticEvent,
  type EventStreamOptions,
} from "@workspace/pubsub";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  AGENTIC_PROTOCOL_VERSION,
  brandId,
  type MessageId,
  type BlockId,
} from "@workspace/agentic-protocol";
import { ChannelViewFeed, type FollowableChannelClient } from "./channel-view-feed.js";

function message(seq: number, content: string): IncomingAgenticEvent {
  return {
    type: AGENTIC_EVENT_PAYLOAD_KIND,
    delivery: "log",
    phase: "replay",
    pubsubId: seq,
    envelopeId: `envelope-${seq}`,
    senderId: "agent",
    ts: 1_000,
    contentClass: "internal",
    externalKeys: [],
    payload: {
      kind: "message.completed",
      actor: { kind: "agent", id: "agent" },
      causality: { messageId: brandId<MessageId>(`message-${seq}`) },
      createdAt: "2026-10-14T00:00:00.000Z",
      payload: {
        protocol: AGENTIC_PROTOCOL_VERSION,
        role: "assistant",
        outcome: "completed",
        blocks: [{ blockId: brandId<BlockId>(`block-${seq}`), type: "text", content }],
      },
    },
  };
}

describe("ChannelViewFeed subscriber readiness", () => {
  it("reads every durable page through the same projection before exporting/searching", async () => {
    const feed = new ChannelViewFeed();
    const raw = (seq: number) => {
      const event = message(seq, `message ${seq}`);
      return {
        id: seq,
        messageId: `envelope-${seq}`,
        type: event.type,
        payload: event.payload,
        senderId: event.senderId,
        ts: event.ts,
        contentClass: event.contentClass,
        externalKeys: event.externalKeys,
      };
    };
    const page = vi.fn(async (before: number) => ({
      mode: "before" as const,
      logEvents: before === 5 ? [raw(3), raw(4)] : [raw(1), raw(2)],
      snapshots: [],
      ready: { totalCount: 5, envelopeCount: 5, hasMoreBefore: before === 5 },
    }));
    feed.attach({
      channelId: "chat",
      connected: true,
      firstEnvelopeSeq: 5,
      hasMoreBefore: true,
      getReplayBefore: page,
      getReplayAfter: async () => ({
        mode: "after",
        logEvents: [],
        snapshots: [],
        ready: { totalCount: 5, envelopeCount: 5, hasMoreBefore: false },
      }),
    });
    feed.ingest(message(5, "message 5"));
    let completed = false;
    const reading = feed.readCompleteHistory().then((messages) => {
      completed = true;
      return messages;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(page).not.toHaveBeenCalled();
    feed.ingest({
      type: "replay-complete",
      delivery: "control",
      generation: 1,
      firstEnvelopeSeq: 5,
      hasMoreBefore: true,
    });
    expect((await reading).map((entry) => entry.content)).toEqual([
      "message 1",
      "message 2",
      "message 3",
      "message 4",
      "message 5",
    ]);
    expect(page.mock.calls.map(([before]) => before)).toEqual([5, 3]);
    feed.dispose();
  });

  it("propagates the original history page failure instead of exporting a partial transcript", async () => {
    const failure = new Error("durable history unavailable");
    const feed = new ChannelViewFeed();
    feed.attach({
      channelId: "chat",
      connected: true,
      firstEnvelopeSeq: 5,
      hasMoreBefore: true,
      getReplayBefore: async () => {
        throw failure;
      },
      getReplayAfter: async () => {
        throw failure;
      },
    });
    feed.ingest(message(5, "tail only"));
    feed.ingest({
      type: "replay-complete",
      delivery: "control",
      generation: 1,
      firstEnvelopeSeq: 5,
      hasMoreBefore: true,
    });
    await expect(feed.readCompleteHistory()).rejects.toBe(failure);
    feed.dispose();
  });

  it("does not discard older messages from the already retained projection", () => {
    const feed = new ChannelViewFeed();
    feed.reset("chat");
    for (let seq = 1; seq <= 2001; seq++) feed.ingest(message(seq, `message ${seq}`));
    feed.ingest({
      type: "replay-complete",
      delivery: "control",
      generation: 1,
      firstEnvelopeSeq: 1,
      hasMoreBefore: false,
    });
    expect(feed.getSnapshot().messages).toHaveLength(2001);
    expect(feed.getSnapshot().messages[0]?.content).toBe("message 1");
    feed.dispose();
  });

  it("settles only after a connected client's retained replay reaches this subscriber's boundary", async () => {
    const queue = new AsyncQueue<EventStreamItem>();
    const page = {
      mode: "before" as const,
      logEvents: [],
      snapshots: [],
      ready: { totalCount: 1, envelopeCount: 1, hasMoreBefore: false },
    };
    const client: FollowableChannelClient = {
      channelId: "chat",
      connected: true,
      firstEnvelopeSeq: 7,
      hasMoreBefore: true,
      events: (options?: EventStreamOptions) => {
        options?.signal?.addEventListener("abort", () => queue.cancel(), {
          once: true,
        });
        return queue[Symbol.asyncIterator]();
      },
      getReplayBefore: async () => page,
      getReplayAfter: async () => ({ ...page, mode: "after" }),
    };
    const feed = new ChannelViewFeed();
    const release = feed.follow(client);
    try {
      expect(feed.getSnapshot().replaySettled).toBe(false);
      queue.push(message(7, "retained history"));
      await vi.waitFor(() => expect(feed.view.messages["message-7"]).toBeDefined());
      expect(feed.getSnapshot().replaySettled).toBe(false);
      queue.push({
        type: "replay-complete",
        delivery: "control",
        generation: 1,
        firstEnvelopeSeq: 7,
        hasMoreBefore: true,
      });
      await vi.waitFor(() => expect(feed.getSnapshot().replaySettled).toBe(true));
      expect(feed.getSnapshot().messages[0]?.content).toBe("retained history");
      expect(feed.getSnapshot().hasMoreHistory).toBe(true);
      feed.ingest(message(8, "accepted author readback"));
      expect(feed.getSnapshot().replaySettled).toBe(true);
      feed.reset();
      const next = feed.follow(client);
      queue.close();
      await vi.waitFor(() =>
        expect(feed.getSnapshot().error).toBe(
          "Channel event stream ended before replay delivery completed"
        )
      );
      expect(feed.getSnapshot().replaySettled).toBe(false);
      next();
    } finally {
      release();
      feed.dispose();
    }
  });

  it("settles an empty replay only from its delivered control boundary", () => {
    const feed = new ChannelViewFeed();
    expect(feed.getSnapshot().replaySettled).toBe(false);
    feed.ingest({
      type: "replay-complete",
      delivery: "control",
      generation: 1,
      hasMoreBefore: false,
    });
    expect(feed.getSnapshot()).toMatchObject({
      replaySettled: true,
      messages: [],
    });
    feed.dispose();
  });
});
