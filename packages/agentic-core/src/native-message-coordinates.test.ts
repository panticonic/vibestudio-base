import { describe, expect, it } from "vitest";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  AGENTIC_PROTOCOL_VERSION,
  brandId,
  createInitialChannelViewState,
  reduceChannelView,
  type AgenticEvent,
  type ChannelEnvelope,
  type EnvelopeId,
  type ChannelId,
  type MessageId,
  type BlockId,
} from "@workspace/agentic-protocol";
import { chatMessagesFromChannelView } from "./channel-chat-merge.js";

function envelope(
  metadata: Record<string, unknown>,
  seq = 1,
): ChannelEnvelope<AgenticEvent> {
  const actor = {
    kind: "agent" as const,
    id: "do:workers/agent:Agent:one",
    participantId: "do:workers/agent:Agent:one",
  };
  return {
    envelopeId: brandId<EnvelopeId>(`event:${seq}`),
    channelId: brandId<ChannelId>("channel:one"),
    seq,
    from: actor,
    contentClass: "internal",
    externalKeys: [],
    payloadKind: AGENTIC_EVENT_PAYLOAD_KIND,
    publishedAt: "2026-10-02T00:00:00Z",
    payload: {
      kind: "message.completed",
      actor,
      causality: { messageId: brandId<MessageId>("native:3:11:0") },
      createdAt: "2026-10-02T00:00:00Z",
      payload: {
        protocol: AGENTIC_PROTOCOL_VERSION,
        role: "assistant",
        outcome: "completed",
        blocks: [
          {
            type: "text",
            blockId: brandId<BlockId>("block:one"),
            content: "actual answer",
          },
        ],
        metadata,
      },
    },
  };
}
describe("native response coordinates", () => {
  it("carries genuine native publication coordinates through canonical projection to chat", () => {
    const state = reduceChannelView(
      createInitialChannelViewState(),
      envelope({ nativeConversationId: 3, nativeTaskId: 7, nativeEntryId: 11 }),
    );
    expect(chatMessagesFromChannelView(state)).toEqual([
      expect.objectContaining({
        content: "actual answer",
        native: { conversationId: 3, taskId: 7, entryId: 11 },
      }),
    ]);
  });
  it("does not derive execution coordinates from a message ID or malformed metadata", () => {
    const state = reduceChannelView(
      createInitialChannelViewState(),
      envelope({
        nativeConversationId: 3,
        nativeTaskId: "7",
        nativeEntryId: 11,
      }),
    );
    expect(chatMessagesFromChannelView(state)[0]?.native).toBeUndefined();
  });
  it("keeps the original native response identity across later completed projections", () => {
    let state = reduceChannelView(
      createInitialChannelViewState(),
      envelope({ nativeConversationId: 3, nativeTaskId: 7, nativeEntryId: 11 }),
    );
    state = reduceChannelView(
      state,
      envelope(
        { nativeConversationId: 9, nativeTaskId: 10, nativeEntryId: 12 },
        2,
      ),
    );
    expect(chatMessagesFromChannelView(state)[0]?.native).toEqual({
      conversationId: 3,
      taskId: 7,
      entryId: 11,
    });
  });
});
