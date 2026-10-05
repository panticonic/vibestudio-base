import { afterEach, describe, expect, it } from "vitest";
import {
  createModels,
  fauxProvider,
  fauxAssistantMessage,
  fauxToolCall,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  defineExtension,
  MemoryStorage,
  type Harness,
  type TaskId,
} from "@panticonic/pi-durable";
import { createSuspendTurnTool } from "@workspace/harness";
import { openBoundAgentSession } from "./native-agent-session.js";
import {
  openNativeChannelConversation,
  recordNativeChannelInputAdmission,
  retainedNativeConversationChannel,
  NATIVE_CHANNEL_INPUT_ADMITTED_KIND,
} from "./native-channel-session.js";
import { createNativeSuspendExecution } from "./native-suspend-tool.js";
import { createNativeChannelPublication } from "./native-channel-publication.js";
import {
  agenticEventSchema,
  type AgenticEvent,
} from "@workspace/agentic-protocol";

const context = BACKGROUND_CONTEXT;
const sessions: Harness[] = [];
afterEach(async () => {
  await Promise.all(
    sessions.splice(0).map((harness) => harness.close(context)),
  );
});
async function fixture(
  options: {
    live?: boolean;
    earlyInput?: boolean;
    repeatedWait?: boolean;
  } = {},
) {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const registry = createRegistry();
  const events: AgenticEvent[] = [];
  const publication = createNativeChannelPublication({
    publish: async (_channel, _participant, event) => {
      agenticEventSchema.parse(event);
      events.push(event);
      return event.kind === "message.read"
        ? { recorded: true as const }
        : { id: events.length };
    },
  });
  let harness!: Harness;
  let taskId!: TaskId;
  let early = !!options.earlyInput;
  const execution = createNativeSuspendExecution({
    bindExecution: async (api) => {
      taskId = api.taskId;
      if (early) {
        early = false;
        await submit("early report");
      }
    },
    channelForConversation: async (id, ctx) =>
      (await retainedNativeConversationChannel(harness, id, ctx)).channelId,
    background: () => ({
      live: options.live ?? true,
      unintegrated: ["subagent:one"],
    }),
  });
  const tool = createSuspendTurnTool({ execution });
  registry.install(
    defineExtension({
      name: "suspension",
      tools: [tool],
      tasks: [publication.task],
    }),
  );
  harness = await openBoundAgentSession(
    new MemoryStorage(),
    {
      runtimeId: "do:workers/test:Agent:one",
      authoritySessionId: "lifetime:one",
      contextId: "context:one",
      incarnation: "storage:one",
    },
    {
      models,
      registry,
      publishWake: async () => {},
      prepareCommit: publication.prepareCommit,
    },
    context,
  );
  sessions.push(harness);
  const conversation = await openNativeChannelConversation(
    harness,
    { channelId: "channel:one", contextId: "context:one" },
    {
      model: { provider: "faux", modelId: faux.getModel().id },
      tools: [tool],
    },
    context,
    (tx, conversationId) =>
      publication.bind(tx, conversationId, {
        channelId: "channel:one",
        participantId: "do:workers/test:Agent:one",
        actor: { kind: "agent", id: "do:workers/test:Agent:one" },
        policy: "all",
      }),
  );
  async function submit(content: string) {
    return conversation.submit(
      {
        type: "input",
        whenBusy: "steer",
        content: async (tx, id) => {
          await recordNativeChannelInputAdmission(tx, conversation.id, id);
          return content;
        },
      },
      context,
    );
  }
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall(
          "suspend_turn",
          { reason: "waiting_for_background" },
          { id: "suspend:one" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    ...(options.repeatedWait
      ? [
          fauxAssistantMessage(
            [
              fauxToolCall(
                "suspend_turn",
                { reason: "waiting_for_background" },
                { id: "suspend:two" },
              ),
            ],
            { stopReason: "toolUse" },
          ),
        ]
      : []),
    fauxAssistantMessage("carried on"),
  ]);
  const initial = await submit("go");
  await harness.runPass(context);
  return {
    harness,
    conversation,
    initial,
    submit,
    events,
    taskId: () => taskId,
  };
}
describe("native suspension ownership", () => {
  it("publishes each real background wait and resume on the original turn without losing Stop", async () => {
    const f = await fixture({ repeatedWait: true });
    const lifecycle = () =>
      f.events.filter((event) => event.kind.startsWith("turn."));
    expect(lifecycle().map((event) => event.kind)).toEqual([
      "turn.opened",
      "turn.waiting",
    ]);
    expect(lifecycle()[1]?.payload).toMatchObject({
      reason: "waiting_for_background",
      summary: "Waiting for background work",
    });
    await f.submit("first report");
    await f.harness.runPass(context);
    expect(lifecycle().map((event) => event.kind)).toEqual([
      "turn.opened",
      "turn.waiting",
      "turn.opened",
      "turn.waiting",
    ]);
    await f.submit("second report");
    await f.initial.wait(context);
    await f.harness.runPass(context);
    expect(lifecycle().map((event) => event.kind)).toEqual([
      "turn.opened",
      "turn.waiting",
      "turn.opened",
      "turn.waiting",
      "turn.opened",
      "turn.closed",
    ]);
    expect(new Set(lifecycle().map((event) => event.turnId)).size).toBe(1);
  });
  it("waits on admitted report then answers the original request at the post-tools boundary", async () => {
    const f = await fixture();
    expect((await f.harness.getTask(f.taskId(), context))?.state).toMatchObject(
      {
        status: "waiting",
        condition: {
          kind: "input",
          kinds: [NATIVE_CHANNEL_INPUT_ADMITTED_KIND],
        },
      },
    );
    const report = await f.submit("child report");
    const reported = await report.wait(context);
    const initial = await f.initial.wait(context);
    expect(reported).toMatchObject({ status: "done" });
    expect(initial).toMatchObject({
      status: "done",
      answer: reported.status === "done" ? reported.answer : undefined,
    });
    if (initial.status !== "done" || !initial.answer)
      throw new Error("Original request lost its actual answer");
    expect((await f.conversation.context(context)).messages).toContainEqual(
      expect.objectContaining({
        role: "assistant",
        content: [
          expect.objectContaining({ type: "text", text: "carried on" }),
        ],
      }),
    );
  });
  it("does not miss input already queued before the suspension decision", async () => {
    const f = await fixture({ earlyInput: true });
    expect(await f.initial.wait(context)).toMatchObject({ status: "done" });
    expect((await f.harness.getTask(f.taskId(), context))?.state.status).toBe(
      "terminal",
    );
    await f.conversation.waitForIdle(context);
  });
  it("refuses an unsupported wait and keeps the foreground request actionable", async () => {
    const f = await fixture({ live: false });
    expect(await f.initial.wait(context)).toMatchObject({ status: "done" });
    const entries = await f.conversation.context(context);
    expect(
      entries.messages.some(
        (message) => message.role === "toolResult" && message.isError,
      ),
    ).toBe(true);
  });
  it("explicit cancellation settles the input wait without a timer or report", async () => {
    const f = await fixture();
    await f.conversation.abort(context);
    expect((await f.harness.getTask(f.taskId(), context))?.state).toMatchObject(
      { status: "terminal", outcome: { status: "aborted" } },
    );
    expect(await f.initial.wait(context)).toMatchObject({
      status: "unanswered",
    });
  });
});
