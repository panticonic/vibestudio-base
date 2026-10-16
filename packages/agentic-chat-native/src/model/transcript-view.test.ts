import { describe, expect, it } from "vitest";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  AGENTIC_PROTOCOL_VERSION,
  createInitialChannelViewState,
  reduceChannelView,
  type ChannelViewState,
} from "@workspace/agentic-protocol";
import { chatTranscriptView } from "./transcript-view.js";

function withMessage(
  state: ChannelViewState,
  seq: number,
  role: "user" | "assistant",
  content: string
): ChannelViewState {
  const id = `message-${seq}`;
  const actor =
    role === "user"
      ? { kind: "user" as const, id: "user-1" }
      : { kind: "agent" as const, id: "agent-1" };
  return reduceChannelView(state, {
    envelopeId: `env-${seq}`,
    channelId: "channel-1",
    seq,
    from: { ...actor, participantId: actor.id },
    payloadKind: AGENTIC_EVENT_PAYLOAD_KIND,
    contentClass: "internal",
    externalKeys: [],
    publishedAt: "2026-10-12T08:00:00.000Z",
    payload: {
      kind: "message.completed",
      actor,
      causality: { messageId: id },
      createdAt: "2026-10-12T08:00:00.000Z",
      payload: {
        protocol: AGENTIC_PROTOCOL_VERSION,
        role,
        blocks: [{ blockId: `${id}:0`, type: "text", content }],
        outcome: "completed",
      },
    },
  } as never);
}

const source = {
  selfId: "user-1",
  pendingSendCount: 0,
  hasMoreHistory: false,
  loadingMore: false,
};

describe("chatTranscriptView", () => {
  it("projects the whole conversation into cards, oldest first, with markdown bodies", () => {
    let view = createInitialChannelViewState();
    view = withMessage(view, 1, "user", "hello");
    view = withMessage(view, 2, "assistant", "**done**");
    const result = chatTranscriptView({ ...source, view }, { now: 0 });
    expect(result.cards.map((card) => card.role)).toEqual(["you", "agent"]);
    expect(result.cards[1]?.body).toEqual({ format: "markdown", text: "**done**" });
    expect(result.richMessages.size).toBe(0);
  });

  it("keeps every entry rather than a tail of twenty", () => {
    let view = createInitialChannelViewState();
    for (let seq = 1; seq <= 30; seq += 1) view = withMessage(view, seq, "user", `m${seq}`);
    expect(chatTranscriptView({ ...source, view }, { now: 0 }).cards).toHaveLength(30);
  });

  it("maps an inline-UI card to its durable message", () => {
    const view: ChannelViewState = {
      ...createInitialChannelViewState(),
      inlineUi: {
        "agent-1": {
          "ui-1": {
            id: "ui-1",
            author: { id: "agent-1", kind: "agent" },
            source: { type: "code", code: "export default () => null" },
            renderedAt: "2026-10-12T08:00:00.000Z",
          },
        },
      },
    } as never;
    const result = chatTranscriptView({ ...source, view }, { now: 0 });
    const card = result.cards.find((candidate) => candidate.kind === "rich");
    expect(card).toBeDefined();
    const message = result.richMessages.get(card!.id);
    expect(message?.contentType).toBe("inline_ui");
    expect(message?.inlineUi?.id).toBe("ui-1");
  });

  it("passes history paging state through", () => {
    const result = chatTranscriptView(
      { ...source, view: createInitialChannelViewState(), hasMoreHistory: true, loadingMore: true },
      { now: 0 }
    );
    expect(result).toMatchObject({ hasMoreHistory: true, loadingMore: true });
  });
});
