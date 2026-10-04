import { describe, expect, it } from "vitest";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  AGENTIC_PROTOCOL_VERSION,
  brandId,
  createInitialChannelViewState,
  reduceChannelView,
  readNativeModelStream,
  type AgenticEvent,
  type ChannelEnvelope,
  type EnvelopeId,
  type ChannelId,
  type InvocationId,
  type MessageId,
  type BlockId,
} from "@workspace/agentic-protocol";
import { chatMessagesFromChannelView } from "./channel-chat-merge.js";
const actor = {
  kind: "agent" as const,
  id: "actual-agent",
  participantId: "actual-agent",
};
const source = {
  kind: "native.model-stream" as const,
  conversationId: 3,
  taskId: 8,
  attempt: 1,
  cutoff: 20,
  frontier: 20,
};
function progress(
  message: { content: readonly unknown[] } | null,
  phase: "running" | "cleared" = "running",
  invocationId = "actual-model-round",
  cutoff = 20,
): AgenticEvent<"invocation.progress"> {
  return {
    kind: "invocation.progress",
    actor,
    causality: { invocationId: brandId<InvocationId>(invocationId) },
    payload: {
      protocol: AGENTIC_PROTOCOL_VERSION,
      data: { ...source, cutoff, frontier: cutoff, phase, message },
    },
    createdAt: "2026-10-02T12:00:00.000Z",
  };
}
function project(events: AgenticEvent[]) {
  return events.reduce(
    (state, event, i) =>
      reduceChannelView(state, {
        envelopeId: brandId<EnvelopeId>("env:" + i),
        channelId: brandId<ChannelId>("channel"),
        seq: i + 1,
        from: actor,
        payloadKind: AGENTIC_EVENT_PAYLOAD_KIND,
        payload: event,
        publishedAt: event.createdAt,
        contentClass: "internal",
        externalKeys: [],
      } satisfies ChannelEnvelope<AgenticEvent>),
    createInitialChannelViewState(),
  );
}
function live(events: AgenticEvent[]) {
  return chatMessagesFromChannelView(project(events)).filter((m) =>
    m.id.startsWith("native-stream:"),
  );
}
describe("native model response presentation", () => {
  it("projects genuine readiness typing and bounded full replacement text/thinking without an answer ID", () => {
    expect(live([progress(null)])).toMatchObject([
      { contentType: "typing", complete: false },
    ]);
    const generic: AgenticEvent<"invocation.progress"> = {
      ...progress(null),
      payload: {
        protocol: AGENTIC_PROTOCOL_VERSION,
        message: "Actual authority detail",
      },
    };
    const events = [
      generic,
      progress({
        content: [
          { type: "text", text: "long initial" },
          { type: "thinking", thinking: "original thought" },
        ],
      }),
      progress({ content: [{ type: "text", text: "replacement" }] }),
    ];
    expect(live(events)).toMatchObject([
      { content: "replacement", complete: false },
    ]);
    expect(live(events)[0]).not.toHaveProperty("native");
    const state = project(events);
    expect(state.invocations["actual-model-round"]?.progress).toHaveLength(2);
    expect(state.invocations["actual-model-round"]?.progress[0]?.message).toBe(
      "Actual authority detail",
    );
    expect(
      live([
        progress({
          content: [
            { type: "thinking", thinking: "real thinking" },
            { type: "text", text: "real partial" },
          ],
        }),
      ]),
    ).toMatchObject([
      { content: "real thinking", contentType: "thinking" },
      { content: "real partial" },
    ]);
  });
  it("canonical answer placement outranks late signals while the next genuine round of the same task remains visible", () => {
    const completed: AgenticEvent<"message.completed"> = {
      kind: "message.completed",
      actor,
      causality: { messageId: brandId<MessageId>("native:3:21:0") },
      payload: {
        protocol: AGENTIC_PROTOCOL_VERSION,
        role: "assistant",
        blocks: [
          {
            blockId: brandId<BlockId>("native:3:21:0:block:0"),
            type: "text",
            content: "canonical answer",
          },
        ],
        outcome: "completed",
        metadata: {
          nativeConversationId: 3,
          nativeTaskId: 8,
          nativeEntryId: 21,
        },
      },
      createdAt: "2026-10-02T12:00:01.000Z",
    };
    expect(
      live([
        completed,
        progress({ content: [{ type: "text", text: "late old partial" }] }),
      ]),
    ).toEqual([]);
    expect(
      live([
        completed,
        progress(
          { content: [{ type: "text", text: "new round" }] },
          "running",
          "actual-next-round",
          22,
        ),
      ]),
    ).toMatchObject([{ content: "new round" }]);
  });
  it("a recovered observation follows the real interrupted-entry frontier while retaining its original request cutoff", () => {
    const interrupted: AgenticEvent<"message.completed"> = {
      kind: "message.completed",
      actor,
      causality: { messageId: brandId<MessageId>("native:3:21:0") },
      payload: {
        protocol: AGENTIC_PROTOCOL_VERSION,
        role: "assistant",
        blocks: [
          {
            blockId: brandId<BlockId>("native:3:21:0:block:0"),
            type: "text",
            content: "interrupted partial",
          },
        ],
        outcome: "interrupted",
        metadata: {
          nativeConversationId: 3,
          nativeTaskId: 8,
          nativeEntryId: 21,
        },
      },
      createdAt: "2026-10-02T12:00:01.000Z",
    };
    const resumed: AgenticEvent<"invocation.progress"> = {
      ...progress(null),
      payload: {
        protocol: AGENTIC_PROTOCOL_VERSION,
        data: {
          ...source,
          frontier: 21,
          phase: "running",
          message: {
            content: [{ type: "text", text: "actual resumed response" }],
          },
        },
      },
    };
    expect(live([interrupted, resumed])).toMatchObject([
      { content: "actual resumed response" },
    ]);
  });
  it("explicit observation clearing and authoritative cancellation prevent late partial resurrection", () => {
    const partial = progress({
      content: [{ type: "text", text: "owned partial" }],
    });
    expect(live([partial, progress(null, "cleared")])).toEqual([]);
    const terminal: AgenticEvent<"invocation.cancelled"> = {
      kind: "invocation.cancelled",
      actor,
      causality: partial.causality,
      payload: {
        protocol: AGENTIC_PROTOCOL_VERSION,
        reason: "Actual run cancelled",
        terminalOutcome: "cancelled",
        terminalReasonCode: "user_interrupted",
      },
      createdAt: "2026-10-02T12:00:01.000Z",
    };
    expect(live([partial, terminal, partial])).toEqual([]);
    expect(
      readNativeModelStream({
        ...source,
        taskId: 0,
        phase: "running",
        message: null,
      }),
    ).toBeNull();
    expect(
      readNativeModelStream({
        ...source,
        phase: "cleared",
        message: { content: [] },
      }),
    ).toBeNull();
  });
});
