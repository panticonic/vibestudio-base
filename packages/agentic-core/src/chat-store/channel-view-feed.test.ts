import { describe, expect, it, vi } from "vitest";
import { AsyncQueue, type EventStreamItem, type IncomingAgenticEvent, type EventStreamOptions } from "@workspace/pubsub";
import { AGENTIC_EVENT_PAYLOAD_KIND, AGENTIC_PROTOCOL_VERSION, brandId, type MessageId, type BlockId } from "@workspace/agentic-protocol";
import { ChannelViewFeed, type FollowableChannelClient } from "./channel-view-feed.js";

function message(seq: number, content: string): IncomingAgenticEvent {
  return {
    type: AGENTIC_EVENT_PAYLOAD_KIND, delivery: "log", phase: "replay", pubsubId: seq,
    envelopeId: `envelope-${seq}`, senderId: "agent", ts: 1_000,
    contentClass: "internal", externalKeys: [],
    payload: { kind: "message.completed", actor: { kind: "agent", id: "agent" },
      causality: { messageId: brandId<MessageId>(`message-${seq}`) }, createdAt: "2026-10-14T00:00:00.000Z",
      payload: { protocol: AGENTIC_PROTOCOL_VERSION, role: "assistant", outcome: "completed",
        blocks: [{ blockId: brandId<BlockId>(`block-${seq}`), type: "text", content }] },
    },
  };
}

describe("ChannelViewFeed subscriber readiness", () => {
  it("settles only after a connected client's retained replay reaches this subscriber's boundary", async () => {
    const queue = new AsyncQueue<EventStreamItem>();
    const page = { mode: "before" as const, logEvents: [], snapshots: [], ready: { totalCount: 1, envelopeCount: 1, hasMoreBefore: false } };
    const client: FollowableChannelClient = {
      channelId: "chat", connected: true, firstEnvelopeSeq: 7, hasMoreBefore: true,
      events: (options?: EventStreamOptions) => {
        options?.signal?.addEventListener("abort", () => queue.cancel(), { once: true });
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
      queue.push({ type: "replay-complete", delivery: "control", generation: 1, firstEnvelopeSeq: 7, hasMoreBefore: true });
      await vi.waitFor(() => expect(feed.getSnapshot().replaySettled).toBe(true));
      expect(feed.getSnapshot().messages[0]?.content).toBe("retained history");
      expect(feed.getSnapshot().hasMoreHistory).toBe(true);
      feed.ingest(message(8, "accepted author readback"));
      expect(feed.getSnapshot().replaySettled).toBe(true);
      feed.reset();
      const next = feed.follow(client);
      queue.close();
      await vi.waitFor(() => expect(feed.getSnapshot().error).toBe("Channel event stream ended before replay delivery completed"));
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
    feed.ingest({ type: "replay-complete", delivery: "control", generation: 1, hasMoreBefore: false });
    expect(feed.getSnapshot()).toMatchObject({ replaySettled: true, messages: [] });
    feed.dispose();
  });
});
