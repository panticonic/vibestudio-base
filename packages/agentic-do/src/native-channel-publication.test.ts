import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createModels,
  Type,
  fauxAssistantMessage,
  fauxProvider,
  type AssistantMessage,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  defineExtension,
  defineTool,
  DirectToolResultEntry,
  ToolResultEntry,
  Harness,
  MemoryStorage,
  StorageRejected,
  type Storage,
  type StorageWrite,
} from "@panticonic/pi-durable";
import { openNodeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";
import {
  agenticEventSchema,
  eventKindSchemas,
  type AgenticEvent,
} from "@workspace/agentic-protocol";
import {
  createNativeChannelPublication,
  waitForNativeAnswerPublication,
  nativeAnswerEnvelopeId,
  type NativeChannelProjection,
} from "./native-channel-publication.js";

import type { RpcClient } from "@vibestudio/rpc";
import {
  openBoundAgentSession,
  type AgentHostCall,
} from "./native-agent-session.js";
import {
  openNativeChannelConversation,
  submitNativeChannelDelivery,
  retainedNativeChannelSourceMessage,
  type NativeChannelDelivery,
} from "./native-channel-session.js";
import {
  bindNativeModelInvocation,
  bindNativeToolInvocation,
} from "./native-invocation-boundary.js";

const context = BACKGROUND_CONTEXT;
const binding: NativeChannelProjection = {
  channelId: "channel:one",
  participantId: "participant:one",
  actor: { kind: "agent", id: "agent:one", displayName: "Agent One" },
  policy: "all",
};
const sessions: Harness[] = [];
const directories: string[] = [];
afterEach(async () => {
  const results = await Promise.allSettled(
    sessions.splice(0).map((session) => session.close(context)),
  );
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
  for (const result of results)
    if (result.status === "rejected") throw result.reason;
});
class RejectingStorage extends MemoryStorage {
  reject = false;
  readonly original = new StorageRejected("Publication batch rejected");
  override commit(
    writes: readonly StorageWrite[],
    context: Parameters<Storage["commit"]>[1],
  ) {
    if (
      this.reject &&
      writes.some(
        (write) =>
          write.type === "entry" && write.value.kind === "pi.assistant",
      )
    ) {
      this.reject = false;
      return Promise.reject(this.original);
    }
    return super.commit(writes, context);
  }
}
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
async function fixture(
  options: {
    storage?: Storage;
    onSuccessfulAnswer?: Parameters<typeof createNativeChannelPublication>[0]["onSuccessfulAnswer"];
    policy?: NativeChannelProjection["policy"];
    reportTo?: string;
    publish?: Parameters<typeof createNativeChannelPublication>[0]["publish"];
    tools?: NonNullable<Parameters<typeof defineExtension>[0]["tools"]>;
  } = {},
) {
  const attempts: { key: string; event: AgenticEvent }[] = [];
  const publication = createNativeChannelPublication({
    onSuccessfulAnswer: options.onSuccessfulAnswer,
    publish:
      options.publish ??
      (async (_channel, _participant, event, key) => {
        attempts.push({ key, event });
        return { id: attempts.length };
      }),
  });
  const models = createModels();
  const faux = fauxProvider();
  models.setProvider(faux.provider);
  const registry = createRegistry();
  const extension = defineExtension({
    name: "publication", tasks: [publication.task], tools: options.tools ?? [],
  });
  registry.install(extension);
  const harnessOptions = {
    models,
    registry,
    publishWake: async () => {},
    prepareCommit: publication.prepareCommit,
  };
  const harness = await Harness.open(
    options.storage ?? new MemoryStorage(),
    harnessOptions,
    context,
  );
  sessions.push(harness);
  const conversation = await harness.root(context, {
    agent: {
      model: { provider: "faux", modelId: faux.getModel().id },
      extensions: [extension], tools: options.tools ?? [],
    },
  });
  await conversation.commit(
    (tx) =>
      publication.bind(tx, conversation.id, {
        ...binding,
        policy: options.policy ?? binding.policy,
        ...(options.reportTo ? { reportTo: options.reportTo } : {}),
      }),
    context,
  );
  const append = (
    text: string,
    extra: Parameters<typeof fauxAssistantMessage>[1] &
      Partial<Pick<AssistantMessage, "provider" | "model">> = {},
  ) =>
    conversation.commit(
      (tx) =>
        tx.appendEntry(conversation.id, {
          kind: "pi.assistant",
          model: [
            {
              ...fauxAssistantMessage(text, extra),
              ...(extra.provider ? { provider: extra.provider } : {}),
              ...(extra.model ? { model: extra.model } : {}),
            },
          ],
        }),
      context,
    );
  return {
    harness,
    conversation,
    publication,
    attempts,
    append,
    faux,
    harnessOptions,
  };
}
async function publicationTasks(harness: Harness) {
  return (
    await harness.commit((tx) => tx.scanTasks({}, 100), context)
  ).items.filter((task) => task.kind === "vibestudio.channel-publication");
}

describe("native run activity publication", () => {
  it("opens before the provider produces text and remains interruptible until provider cancellation joins", async () => {
    const entered = gate(), opened = gate(), cancelled = gate(), release = gate();
    const events: AgenticEvent[] = [];
    const f = await fixture({
      publish: async (_channel, _participant, event) => {
        events.push(event);
        if (event.kind === "turn.opened") opened.resolve();
        return { id: events.length };
      },
    });
    f.faux.setResponses([async (_context, options) => {
      options?.signal?.addEventListener("abort", cancelled.resolve, { once: true });
      entered.resolve();
      await release.promise;
      return fauxAssistantMessage("", { stopReason: "aborted" });
    }]);
    const input = await f.conversation.submit({ type: "input", content: "Start" }, context);
    const running = f.harness.runPass(context);
    let stopping: Promise<void> | undefined;
    try {
      await entered.promise;
      await opened.promise;
      expect(events.map((event) => event.kind)).toEqual(["turn.opened"]);
      stopping = f.conversation.abort(context, { background: true });
      await cancelled.promise;
      expect(events.map((event) => event.kind)).toEqual(["turn.opened"]);
      release.resolve();
      await stopping;
      await running;
      await f.harness.runPass(context);
      expect(events.filter((event) => event.kind.startsWith("turn.")).map((event) => event.kind))
        .toEqual(["turn.opened", "turn.closed"]);
      expect(await input.wait(context)).toMatchObject({ status: "unanswered", reason: "aborted" });
    } finally {
      release.resolve();
      await stopping;
      await running;
    }
  });

  it("remembers the actual model only after its successful final answer is accepted", async () => {
    const remembered: string[] = [];
    const f = await fixture({
      onSuccessfulAnswer: async (model) => {
        expect(
          f.attempts.some(({ event }) => event.kind === "message.completed"),
        ).toBe(true);
        remembered.push(model);
      },
    });
    f.faux.setResponses([fauxAssistantMessage("Finished")]);
    await f.conversation.submit({ type: "input", content: "Start" }, context);
    await f.harness.runPass(context);
    const answer = f.attempts.find(
      ({ event }) => event.kind === "message.completed",
    )!.event;
    if (answer.kind !== "message.completed") throw new Error("Missing answer");
    expect(remembered).toEqual([`faux:${f.faux.getModel().id}`]);
  });

  it("does not remember a failed model answer", async () => {
    const remembered: string[] = [];
    const f = await fixture({
      onSuccessfulAnswer: async (model) => {
        remembered.push(model);
      },
    });
    f.faux.setResponses([
      fauxAssistantMessage("Failure", {
        stopReason: "error",
        errorMessage: "Provider failed",
      }),
    ]);
    await f.conversation.submit({ type: "input", content: "Start" }, context);
    await f.harness.runPass(context);
    expect(
      f.attempts.some(
        ({ event }) =>
          event.kind === "message.completed" &&
          "outcome" in event.payload && event.payload.outcome === "interrupted",
      ),
    ).toBe(true);
    expect(remembered).toEqual([]);
  });

  it("retains a default-save failure and joins it when publication is explicitly retried", async () => {
    let fail = true;
    const remembered: string[] = [];
    const f = await fixture({
      onSuccessfulAnswer: async (model) => {
        if (fail) throw new Error("Default save failed");
        remembered.push(model);
      },
    });
    f.faux.setResponses([fauxAssistantMessage("Finished")]);
    await f.conversation.submit({ type: "input", content: "Start" }, context);
    await f.harness.runPass(context);
    const failed = (await publicationTasks(f.harness)).find((task) =>
      task.state.status === "waiting" && task.state.condition.kind === "failure",
    );
    if (!failed || failed.state.status !== "waiting" || failed.state.condition.kind !== "failure")
      throw new Error("Missing retained default-save failure");
    expect(remembered).toEqual([]);
    fail = false;
    await f.harness.retryTask(failed.id, failed.state.condition.incident, context);
    await f.harness.runPass(context);
    expect(remembered).toEqual([`faux:${f.faux.getModel().id}`]);
    expect((await publicationTasks(f.harness)).every((task) => task.state.status === "terminal")).toBe(true);
  });

  it("recovers lifecycle publication after a lost acceptance reply without opening a second turn", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-run-publication-"));
    directories.push(directory);
    const path = join(directory, "session.sqlite");
    const accepted = new Map<string, AgenticEvent>();
    const attempts: { key: string; event: AgenticEvent }[] = [];
    let lose = true;
    const f = await fixture({
      storage: await openNodeSqliteStorage(path),
      publish: async (_channel, _participant, event, key) => {
        attempts.push({ key, event });
        expect(accepted.get(key) ?? event).toEqual(event);
        accepted.set(key, event);
        if (lose) {
          lose = false;
          throw new Error("Run opening acceptance reply lost");
        }
        return { id: accepted.size };
      },
    });
    f.faux.setResponses([fauxAssistantMessage("Finished")]);
    await f.conversation.submit({ type: "input", content: "Start" }, context);
    await f.harness.runPass(context);
    const failed = (await publicationTasks(f.harness))[0]!;
    if (failed.state.status !== "waiting" || failed.state.condition.kind !== "failure")
      throw new Error("Missing retained opening publication failure");
    const incident = failed.state.condition.incident;
    await f.harness.close(context);
    const reopened = await Harness.open(await openNodeSqliteStorage(path), f.harnessOptions, context);
    sessions.push(reopened);
    expect(await reopened.retryTask(failed.id, incident, context)).toBe("queued");
    await reopened.runPass(context);
    expect(attempts[0]).toEqual(attempts[1]);
    expect([...accepted.values()].map((event) => event.kind)).toEqual([
      "turn.opened", "message.completed", "turn.closed",
    ]);
    expect((await publicationTasks(reopened)).every((task) => task.state.status === "terminal")).toBe(true);
  });

  for (const cancel of [false, true]) {
    it(`keeps one interruptible turn across tool execution and ${cancel ? "joins cancellation" : "closes after the final answer"}`, async () => {
      const entered = gate();
      const release = gate();
      const cancelled = gate();
      const tool = defineTool({
        name: "held_work",
        description: "Work with explicit completion and cancellation gates",
        parameters: Type.Object({}),
        execute: async (_args, _api, ctx) => {
          ctx.abortSignal?.addEventListener("abort", cancelled.resolve, { once: true });
          entered.resolve();
          await release.promise;
          return { content: [{ type: "text", text: "Work joined" }] };
        },
      });
      const f = await fixture({ tools: [tool] });
      f.faux.setResponses([
        fauxAssistantMessage([
          { type: "toolCall", id: "held-call", name: tool.name, arguments: {} },
        ], { stopReason: "toolUse" }),
        fauxAssistantMessage("Finished"),
      ]);
      const input = await f.conversation.submit({ type: "input", content: "Work" }, context);
      const running = f.harness.runPass(context);
      let stopping: Promise<void> | undefined;
      try {
        await entered.promise;
        // Join the round's canonical publication while its tool remains running.
        const entries = await f.conversation.entries({}, 100, undefined, context);
        const round = entries.items.find((entry) => entry.kind === "pi.assistant")!;
        await waitForNativeAnswerPublication(f.harness, f.conversation.id, round.id, context);
        const lifecycle = () => f.attempts.filter(({ event }) => event.kind.startsWith("turn."));
        expect(lifecycle().map(({ event }) => event.kind)).toEqual(["turn.opened"]);
        const opened = lifecycle()[0]!.event;
        expect(opened.actor.id).toBe(binding.actor.id);
        expect(opened.turnId).toBe(`native-run:${f.conversation.id}:${input.id}`);
        if (cancel) {
          stopping = f.conversation.abort(context, { background: true });
          await cancelled.promise;
          expect(lifecycle().map(({ event }) => event.kind)).toEqual(["turn.opened"]);
        }
        release.resolve();
        await stopping;
        await running;
        await f.harness.runPass(context);
        expect(lifecycle().map(({ event }) => event.kind)).toEqual(["turn.opened", "turn.closed"]);
        expect(lifecycle()[1]!.event.turnId).toBe(opened.turnId);
        expect(await input.wait(context)).toMatchObject({ status: cancel ? "unanswered" : "done" });
        const final = f.attempts.findIndex(({ event }) =>
          event.kind === "message.completed" && "tier" in event.payload && event.payload.tier === "primary");
        if (!cancel) {
          expect(final).toBeGreaterThan(0);
          expect(f.attempts[final]!.event.turnId).toBe(opened.turnId);
          expect(f.attempts.findIndex(({ event }) => event.kind === "turn.closed")).toBeGreaterThan(final);
        } else {
          expect(lifecycle()[1]!.event.payload).toMatchObject({ reason: "user_interrupted" });
        }
      } finally {
        release.resolve();
        await stopping;
        await running;
      }
    });
  }
});

describe("native assistant terminal failure presentation", () => {
  it("publishes one original-time classified failure with genuine native answer and envelope coordinates", async () => {
    const f = await fixture();
    const entry = await f.append("partial response", {
      provider: "openai-codex",
      model: "gpt-6-luna",
      timestamp: 0,
      stopReason: "error",
      errorMessage: '{"error":{"type":"usage_limit_reached","resets_at":10}}',
    });
    await f.harness.runPass(context);
    expect(f.attempts).toHaveLength(1);
    const event = agenticEventSchema.parse(
      f.attempts[0]!.event,
    ) as AgenticEvent<"message.completed">;
    expect(event).toMatchObject({
      kind: "message.completed",
      createdAt: "1970-01-01T00:00:00.000Z",
      causality: { messageId: `native:${entry.conversationId}:${entry.id}:0` },
      payload: {
        outcome: "interrupted",
        failure: {
          code: "usage_limit_terminal",
          recoverable: false,
          resetAt: "1970-01-01T00:00:10.000Z",
        },
        metadata: {
          nativeEntryId: entry.id,
          nativeConversationId: entry.conversationId,
        },
      },
    });
    expect(nativeAnswerEnvelopeId(event.causality!.messageId!)).toBe(
      `ik:${f.attempts[0]!.key}`,
    );
    expect(() => nativeAnswerEnvelopeId("legacy-answer-id")).toThrow(
      "actual native",
    );
  });
  it("keeps explicit cancellation distinct from provider failure without a reset or retry invitation", async () => {
    const f = await fixture();
    await f.append("", {
      stopReason: "aborted",
      errorMessage: "Explicit user cancellation",
    });
    await f.harness.runPass(context);
    const event = f.attempts[0]!.event;
    expect(event).toMatchObject({
      kind: "message.completed",
      payload: {
        outcome: "interrupted",
        failure: {
          code: "cancelled",
          reason: "Explicit user cancellation",
          recoverable: false,
        },
      },
    });
    if (event.kind !== "message.completed")
      throw new Error("Missing actual completion event");
    expect(
      eventKindSchemas["message.completed"].parse(event).payload.failure,
    ).not.toHaveProperty("resetAt");
  });
  it("publishes a failed primary and successful fallback as their own actual native answers", async () => {
    const f = await fixture();
    const failed = await f.append("", {
      stopReason: "error",
      errorMessage: "Temporary upstream failure",
    });
    const succeeded = await f.append("Actual fallback answer");
    await f.harness.runPass(context);
    expect(f.attempts).toHaveLength(2);
    expect(f.attempts[0]!.event).toMatchObject({
      payload: {
        failure: { recoverable: true },
        outcome: "interrupted",
        metadata: { nativeEntryId: failed.id },
      },
    });
    expect(f.attempts[1]!.event).toMatchObject({
      payload: {
        outcome: "completed",
        metadata: { nativeEntryId: succeeded.id },
      },
    });
    if (f.attempts[1]!.event.kind !== "message.completed")
      throw new Error("Missing genuine fallback completion");
    expect(f.attempts[1]!.event.payload).not.toHaveProperty("failure");
  });
});

describe("exact native answer publication observation", () => {
  it("joins the actual answer acceptance instead of native input or provider completion", async () => {
    const started = gate();
    const accepted = gate();
    const f = await fixture({
      publish: async () => {
        started.resolve();
        await accepted.promise;
        return { id: 1 };
      },
    });
    const entry = await f.append("actual answer");
    let resolved = false;
    const answer = waitForNativeAnswerPublication(
      f.harness,
      f.conversation.id,
      entry.id,
      context,
    ).then((value) => {
      resolved = true;
      return value;
    });
    const running = f.harness.runPass(context);
    try {
      await started.promise;
      expect(resolved).toBe(false);
      accepted.resolve();
      await running;
      expect(await answer).toMatchObject({
        conversationId: f.conversation.id,
        entryId: entry.id,
        messages: [
          { text: "actual answer", outcome: "completed", published: true },
        ],
        publicationTaskIds: [(await publicationTasks(f.harness))[0]!.id],
      });
    } finally {
      accepted.resolve();
      await Promise.allSettled([running, answer]);
    }
  });
  it("propagates the original canonical publication failure while retaining its repairable debt", async () => {
    const original = new Error("canonical acceptance failed");
    const f = await fixture({
      publish: async () => {
        throw original;
      },
    });
    const entry = await f.append("owned answer");
    await f.harness.runPass(context);
    await expect(
      waitForNativeAnswerPublication(
        f.harness,
        f.conversation.id,
        entry.id,
        context,
      ),
    ).rejects.toBe(original);
    expect((await publicationTasks(f.harness))[0]!.state).toMatchObject({
      status: "waiting",
      condition: { kind: "failure" },
    });
  });
  it("propagates an earlier publication incident through ordered debt and permits explicit repair", async () => {
    const original = new Error("predecessor channel acceptance failed");
    let repaired = false;
    const accepted: string[] = [];
    const f = await fixture({
      publish: async (_channel, _participant, _event, key) => {
        if (!repaired) throw original;
        accepted.push(key);
        return { id: accepted.length };
      },
    });
    await f.append("first answer");
    await f.append("second answer");
    const entry = await f.append("final owned answer");
    const observation = expect(
      waitForNativeAnswerPublication(
        f.harness,
        f.conversation.id,
        entry.id,
        context,
      ),
    ).rejects.toBe(original);
    await f.harness.runPass(context);
    await observation;
    const tasks = await publicationTasks(f.harness);
    const failed = tasks[0]!;
    expect(tasks.slice(1).map((task) => task.state)).toMatchObject([
      { status: "waiting", condition: { kind: "tasks" } },
      { status: "waiting", condition: { kind: "tasks" } },
    ]);
    if (
      failed.state.status !== "waiting" ||
      failed.state.condition.kind !== "failure"
    )
      throw new Error("Missing retained predecessor repair incident");
    expect(accepted).toEqual([]);
    repaired = true;
    expect(
      await f.harness.retryTask(
        failed.id,
        failed.state.condition.incident,
        context,
      ),
    ).toBe("queued");
    await f.harness.runPass(context);
    expect(
      await waitForNativeAnswerPublication(
        f.harness,
        f.conversation.id,
        entry.id,
        context,
      ),
    ).toMatchObject({
      messages: [{ text: "final owned answer", published: true }],
    });
    expect(accepted).toHaveLength(3);
    expect(
      (await publicationTasks(f.harness)).every(
        (task) =>
          task.state.status === "terminal" &&
          task.state.outcome.status === "completed",
      ),
    ).toBe(true);
  });
  it("returns actual empty provider outcome after canonical acceptance without inventing a visible chat row", async () => {
    const f = await fixture();
    f.faux.setResponses([fauxAssistantMessage("")]);
    const submission = await f.conversation.submit(
      { type: "input", content: "request" },
      context,
    );
    await f.harness.runPass(context);
    const settled = await submission.wait(context);
    if (settled.status !== "done" || settled.type !== "input")
      throw new Error("Input did not settle with an actual answer");
    const answer = await waitForNativeAnswerPublication(
      f.harness,
      f.conversation.id,
      settled.answer,
      context,
    );
    expect(answer.taskId).toBeGreaterThan(0);
    expect(answer.messages).toMatchObject([
      { text: "", outcome: "empty", published: true },
    ]);
    expect(f.attempts.map(({ event }) => event.kind)).toEqual([
      "turn.opened", "message.completed", "turn.closed",
    ]);
  });
  it("reports captured suppression truthfully and rejects another conversation's answer", async () => {
    const f = await fixture({ policy: "notify-only" });
    const entry = await f.append("private answer");
    const answer = await waitForNativeAnswerPublication(
      f.harness,
      f.conversation.id,
      entry.id,
      context,
    );
    expect(answer.publicationTaskIds).toEqual([]);
    expect(answer.messages).toMatchObject([
      { text: "private answer", outcome: "completed", published: false },
    ]);
    const other = await f.harness.createConversation(
      { ownership: { kind: "ownerless" } },
      context,
    );
    await expect(
      waitForNativeAnswerPublication(f.harness, other.id, entry.id, context),
    ).rejects.toThrow("original assistant entry");
  });
  it("reacquires the exact immutable answer-to-task binding after SQLite replacement", async () => {
    const dir = await mkdtemp(join(tmpdir(), "native-answer-publication-"));
    directories.push(dir);
    const path = join(dir, "session.sqlite");
    const f = await fixture({ storage: await openNodeSqliteStorage(path) });
    const entry = await f.append("durable answer");
    await f.harness.close(context);
    const reopened = await Harness.open(
      await openNodeSqliteStorage(path),
      f.harnessOptions,
      context,
    );
    sessions.push(reopened);
    await reopened.runPass(context);
    const answer = await waitForNativeAnswerPublication(
      reopened,
      f.conversation.id,
      entry.id,
      context,
    );
    expect(answer.publicationTaskIds).toEqual([
      (await publicationTasks(reopened))[0]!.id,
    ]);
    expect(answer.messages).toMatchObject([
      { text: "durable answer", outcome: "completed", published: true },
    ]);
  });
});

describe("native channel publication ownership", () => {
  it("addresses a child's actual final report to its retained supervisor without forwarding tool progress", async () => {
    const f = await fixture({ reportTo: "supervisor:one" });
    await f.append("Checking the files", { stopReason: "toolUse" });
    const answer = await f.append("Counted 12 files and 50 lines");
    await f.harness.runPass(context);
    const messages = f.attempts.map(
      ({ event }) => event as AgenticEvent<"message.completed">,
    );
    expect(messages).toHaveLength(2);
    expect(messages[0]!.payload).not.toHaveProperty("to");
    expect(messages[1]!).toMatchObject({
      kind: "message.completed",
      causality: {
        messageId: `native:${answer.conversationId}:${answer.id}:0`,
      },
      payload: {
        outcome: "completed",
        to: [{ kind: "participant", participantId: "supervisor:one" }],
      },
    });
    await expect(
      f.conversation.commit(
        (tx) =>
          f.publication.bind(tx, f.conversation.id, {
            ...binding,
            reportTo: "different-supervisor",
          }),
        context,
      ),
    ).rejects.toThrow("immutable binding");
    expect(
      await waitForNativeAnswerPublication(
        f.harness,
        answer.conversationId,
        answer.id,
        context,
      ),
    ).toMatchObject({
      messages: [{ outcome: "completed", published: true }],
    });
  });

  it("publishes canonical generated assistant text, thinking/replay, usage, stopreason and native identity", async () => {
    const f = await fixture();
    f.faux.setResponses([
      fauxAssistantMessage([
        {
          type: "thinking",
          thinking: "reasoning",
          thinkingSignature: "opaque",
        },
        { type: "text", text: "answer", textSignature: "text-proof" },
      ]),
    ]);
    await f.conversation.submit({ type: "input", content: "hello" }, context);
    await f.harness.runPass(context);
    expect(f.attempts.map(({ event }) => event.kind)).toEqual([
      "turn.opened", "message.completed", "turn.closed",
    ]);
    const event = f.attempts[1]!.event;
    expect(agenticEventSchema.safeParse(event).success).toBe(true);
    expect(event).toMatchObject({
      kind: "message.completed",
      actor: binding.actor,
      payload: {
        role: "assistant",
        tier: "primary",
        outcome: "completed",
        metadata: { stopReason: "stop", nativeTaskId: expect.any(Number) },
        blocks: [
          {
            type: "thinking",
            content: "reasoning",
            metadata: { pi: { thinkingSignature: "opaque" } },
          },
          {
            type: "text",
            content: "answer",
            metadata: { pi: { textSignature: "text-proof" } },
          },
        ],
      },
    });
    expect((await publicationTasks(f.harness))[0]!.state.status).toBe(
      "terminal",
    );
  });
  it.each(["turn-final", "notify-only"] as const)(
    "evaluates immutable %s policy without losing the canonical assistant entry",
    async (policy) => {
      const f = await fixture({ policy });
      await f.append("intermediate", { stopReason: "toolUse" });
      await f.append("final");
      await f.harness.runPass(context);
      expect(f.attempts).toHaveLength(policy === "turn-final" ? 1 : 0);
      if (policy === "turn-final")
        expect(f.attempts[0]!.event.payload).toMatchObject({ tier: "primary" });
      expect(
        (await f.conversation.entries({}, 20, undefined, context)).items,
      ).toHaveLength(2);
    },
  );
  it("preserves tool-call intent as data rather than inventing an executable invocation identity", async () => {
    const f = await fixture();
    await f.conversation.commit(
      (tx) =>
        tx.appendEntry(f.conversation.id, {
          kind: "pi.assistant",
          model: [
            fauxAssistantMessage(
              [
                {
                  type: "toolCall",
                  id: "call:one",
                  name: "eval",
                  arguments: { code: "hello" },
                  thoughtSignature: "proof",
                },
              ],
              { stopReason: "toolUse" },
            ),
          ],
        }),
      context,
    );
    await f.harness.runPass(context);
    expect(f.attempts[0]!.event.payload).toMatchObject({
      tier: "secondary",
      outcome: "tool_calls_only",
      blocks: [
        {
          type: "data",
          metadata: {
            pi: {
              type: "toolCall",
              id: "call:one",
              name: "eval",
              arguments: { code: "hello" },
              thoughtSignature: "proof",
            },
          },
        },
      ],
    });
  });
  it("commits assistant entry and publication task together and rolls both back on deterministic rejection", async () => {
    const storage = new RejectingStorage();
    const f = await fixture({ storage });
    storage.reject = true;
    await expect(f.append("rejected")).rejects.toBe(storage.original);
    expect(
      (await f.conversation.entries({}, 20, undefined, context)).items,
    ).toEqual([]);
    expect(await publicationTasks(f.harness)).toEqual([]);
    await f.append("accepted");
    expect(await publicationTasks(f.harness)).toHaveLength(1);
    await f.harness.runPass(context);
    expect(f.attempts).toHaveLength(1);
  });
  it("does not overtake a held predecessor or detach its delivery ownership", async () => {
    const entered = gate();
    const release = gate();
    const calls: string[] = [];
    const f = await fixture({
      publish: async (_channel, _participant, _event, key) => {
        calls.push(key);
        if (calls.length === 1) {
          entered.resolve();
          await release.promise;
        }
        return { id: calls.length };
      },
    });
    await f.append("first");
    await f.append("second");
    const queued = await publicationTasks(f.harness);
    const successorId = queued[1]!.id;
    const waiting = gate();
    const unsubscribe = f.harness.subscribeCommits((publication) => {
      for (const change of publication.changes) {
        if (
          change.type === "task" &&
          change.value.id === successorId &&
          change.value.state.status === "waiting" &&
          change.value.state.condition.kind === "tasks"
        )
          waiting.resolve();
      }
    });
    const running = f.harness.runPass(context);
    try {
      await entered.promise;
      await waiting.promise;
      expect(calls).toHaveLength(1);
      const tasks = await publicationTasks(f.harness);
      expect(tasks[1]!.state).toMatchObject({
        status: "waiting",
        condition: { kind: "tasks", on: [queued[0]!.id], policy: "allSettled" },
      });
      release.resolve();
      await running;
      expect(calls).toHaveLength(2);
    } finally {
      release.resolve();
      await running;
      unsubscribe();
    }
  });
  it("retains original lost-ack failure and exact keys/events across SQLite reopen and explicit repair", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-publication-"));
    directories.push(directory);
    const path = join(directory, "session.sqlite");
    const accepted = new Map<string, string>();
    const attempts: { key: string; event: AgenticEvent }[] = [];
    const original = new Error(
      "channel acknowledged durably but reply was lost",
    );
    let lose = true;
    const f = await fixture({
      storage: await openNodeSqliteStorage(path),
      publish: async (_channel, _participant, event, key) => {
        attempts.push({ key, event });
        const serialized = JSON.stringify(event);
        expect(accepted.get(key) ?? serialized).toBe(serialized);
        accepted.set(key, serialized);
        if (lose) {
          lose = false;
          throw original;
        }
        return { id: accepted.size };
      },
    });
    await f.append("retained");
    await f.append("later");
    await f.harness.runPass(context);
    const failed = (await publicationTasks(f.harness))[0]!;
    expect(failed.state).toMatchObject({
      status: "waiting",
      condition: { kind: "failure" },
    });
    await expect(f.harness.waitForTask(failed.id, context)).rejects.toBe(
      original,
    );
    expect(attempts).toHaveLength(1);
    if (
      failed.state.status !== "waiting" ||
      failed.state.condition.kind !== "failure"
    )
      throw new Error("No exact repair incident");
    const incident = failed.state.condition.incident;
    await f.harness.close(context);
    const reopened = await Harness.open(
      await openNodeSqliteStorage(path),
      f.harnessOptions,
      context,
    );
    sessions.push(reopened);
    await reopened.runPass(context);
    expect(attempts).toHaveLength(1);
    await expect(reopened.waitForTask(failed.id, context)).rejects.toThrow(
      original.message,
    );
    expect(await reopened.retryTask(failed.id, incident, context)).toBe(
      "queued",
    );
    await reopened.runPass(context);
    expect(attempts).toHaveLength(3);
    expect(attempts[0]).toEqual(attempts[1]);
    expect(accepted.size).toBe(2);
    expect(
      (await publicationTasks(reopened)).every(
        (task) => task.state.status === "terminal",
      ),
    ).toBe(true);
  });
  it("pins projection binding and leaves forked conversations unbound", async () => {
    const f = await fixture();
    await f.conversation.commit(
      (tx) =>
        f.publication.bind(tx, f.conversation.id, structuredClone(binding)),
      context,
    );
    await expect(
      f.conversation.commit(
        (tx) =>
          f.publication.bind(tx, f.conversation.id, {
            ...binding,
            participantId: "other",
          }),
        context,
      ),
    ).rejects.toThrow("immutable binding");
    const entry = await f.append("original");
    const fork = await f.conversation.fork(
      entry.id,
      { ownership: { kind: "ownerless" } },
      context,
    );
    await fork.commit(
      (tx) =>
        tx.appendEntry(fork.id, {
          kind: "pi.assistant",
          model: [fauxAssistantMessage("fork")],
        }),
      context,
    );
    await f.harness.runPass(context);
    expect(f.attempts).toHaveLength(1);
  });
  it("explicit cancellation drains accepted publication debt instead of discarding it", async () => {
    const f = await fixture();
    await f.append("owed");
    const task = (await publicationTasks(f.harness))[0]!;
    await f.harness.abortTask(task.id, context);
    await f.harness.runPass(context);
    expect(f.attempts).toHaveLength(1);
    expect((await f.harness.getTask(task.id, context))?.state).toMatchObject({
      status: "terminal",
      outcome: { status: "completed" },
    });
  });
  it("explicit cancellation propagates a retained predecessor incident without stranding its join", async () => {
    const original = new Error("earlier publication needs repair");
    const f = await fixture({ publish: async () => { throw original; } });
    await f.append("first owed answer");
    await f.append("second owed answer");
    await f.append("last owed answer");
    await f.harness.runPass(context);
    const tasks = await publicationTasks(f.harness);
    const last = tasks.at(-1)!;
    await f.harness.abortTask(last.id, context);
    await f.harness.runPass(context);
    await expect(f.harness.waitForTask(last.id, context)).rejects.toBe(original);
    expect((await f.harness.getTask(tasks[0]!.id, context))?.state).toMatchObject({
      status: "waiting", condition: { kind: "failure" },
    });
    expect((await f.harness.getTask(last.id, context))?.state).toMatchObject({
      status: "waiting", condition: { kind: "failure" },
    });
  });
  it.each([
    { origin: "direct", isError: false, failureKind: null },
    { origin: "direct", isError: true, failureKind: null },
    { origin: "assistant", isError: false, failureKind: null },
    { origin: "assistant", isError: true, failureKind: null },
    { origin: "direct", isError: true, failureKind: "infrastructure" },
    { origin: "assistant", isError: true, failureKind: "infrastructure" },
  ])(
    "publishes committed $origin tool arguments and output when isError=$isError",
    async ({ origin, isError, failureKind }) => {
      const owner = {
        runtimeId: "do:workers/native:Agent:direct",
        contextId: "context:one",
        incarnation: "storage:one",
        authoritySessionId: "lifetime:one",
      };
      const image = {
        runtimeId: owner.runtimeId,
        source: "workers/native",
        className: "Agent",
        objectKey: "direct",
        executionDigest: "a".repeat(64),
      };
      const callHost: AgentHostCall = async <T>() =>
        ({
          id: owner.runtimeId,
          authoritySessionId: owner.authoritySessionId,
          kind: "do",
          status: "active",
          source: { repoPath: image.source, effectiveVersion: "state:one" },
          contextId: owner.contextId,
          className: image.className,
          key: image.objectKey,
          activeExecutionDigest: image.executionDigest,
          agentBinding: {
            entityId: owner.runtimeId,
            contextId: owner.contextId,
            channelId: "channel:primary",
          },
          createdAt: 1,
          cleanupComplete: false,
        }) as T;
      const rpc: RpcClient = {
        selfId: owner.runtimeId,
        expose() {},
        exposeAll() {},
        exposeStreaming() {},
        async call<T>() {
          return null as T;
        },
        async stream() {
          throw new Error("Unexpected stream");
        },
        async streamReadable() {
          throw new Error("Unexpected stream");
        },
        async emit() {},
        on: () => () => {},
        peer() {
          throw new Error("Unexpected peer");
        },
        status: () => "connected",
        ready: () => Promise.resolve(),
        onStatusChange: () => () => {},
      };
      const calls: { event: AgenticEvent; channel: string }[] = [];
      const publication = createNativeChannelPublication({
        publish: async (channel, _participant, event) => {
          calls.push({ event, channel });
          return { id: calls.length };
        },
      });
      let harness!: Harness;
      const tool = defineTool({
        name: "direct_proof",
        description: "Actual direct source",
        parameters: Type.Object({ value: Type.String() }),
        execute: async (args, api, ctx) => {
          await bindNativeToolInvocation(
            {
              harness,
              image,
              callHost,
              rpc,
              publishStart: async (channel, event) => {
                calls.push({ event, channel });
                return { id: calls.length };
              },
            },
            api,
            ctx,
          );
          return {
            content: [
              {
                type: "text",
                text: isError
                  ? "Original direct failure"
                  : "Actual direct success",
              },
            ],
            details: {
              source: origin,
              returnValue: args.value,
              console: "captured console",
              ...(failureKind ? {
                failureKind,
                failureCode: "owned_transport_failure",
                errorData: { code: "owned_transport_failure", recovery: { action: "reobserve" } },
              } : {}),
            },
            isError,
          };
        },
      });
      const registry = createRegistry();
      const extension = defineExtension({
        name: "tool-publication",
        tasks: [publication.task],
        tools: [tool],
      });
      registry.install(extension);
      const models = createModels();
      const faux = fauxProvider();
      models.setProvider(faux.provider);
      faux.setResponses([
        fauxAssistantMessage(
          [
            {
              type: "toolCall",
              id: "actual-tool-call",
              name: tool.name,
              arguments: { value: "committed input" },
            },
          ],
          { stopReason: "toolUse" },
        ),
        fauxAssistantMessage("Tool finished"),
      ]);
      harness = await openBoundAgentSession(
        new MemoryStorage(),
        owner,
        {
          models,
          registry,
          publishWake: async () => {},
          prepareCommit: publication.prepareCommit,
        },
        context,
      );
      sessions.push(harness);
      const conversation = await harness.root(context, {
        agent: {
          extensions: [extension],
          tools: [tool],
          model: { provider: "faux", modelId: faux.getModel().id },
        },
      });
      await conversation.commit(
        (tx) =>
          publication.bind(tx, conversation.id, {
            ...binding,
            participantId: owner.runtimeId,
            actor: { kind: "agent", id: owner.runtimeId },
          }),
        context,
      );
      if (origin === "direct") {
        const direct = await conversation.invokeTool(
          {
            id: "actual-tool-call",
            name: tool.name,
            arguments: { value: "committed input" },
          },
          context,
        );
        expect(
          (await harness.waitForTask(direct, context)).state.outcome.status,
        ).toBe("completed");
      } else {
        await conversation.submit(
          { type: "input", content: "Use the tool" },
          context,
        );
      }
      await harness.runPass(context);
      const terminals = calls.filter(
        (call) =>
          call.event.kind === "invocation.completed" ||
          call.event.kind === "invocation.failed",
      );
      expect(terminals).toHaveLength(1);
      expect(terminals[0]!.channel).toBe("channel:primary");
      expect(terminals[0]!.event.kind).toBe(
        isError ? "invocation.failed" : "invocation.completed",
      );
      const starts = calls.filter(
        (call) => call.event.kind === "invocation.started",
      );
      expect(starts.length).toBeGreaterThan(0);
      for (const start of starts) {
        expect(start.event.payload).toMatchObject({
          name: tool.name,
          request: { value: "committed input" },
        });
      }
      if (!isError) {
        expect(terminals[0]!.event.payload).toMatchObject({
          result: {
            protocolContent: [{ type: "text", text: "Actual direct success" }],
            details: {
              source: origin,
              returnValue: "committed input",
              console: "captured console",
            },
          },
        });
      }
      if (isError)
        expect(terminals[0]!.event.payload).toMatchObject({
          reason: "Original direct failure",
          terminalOutcome: failureKind === "infrastructure" ? "infrastructure_error" : "tool_error",
          failure: {
            operation: "direct_proof",
            ...(failureKind ? { kind: failureKind, code: "owned_transport_failure" } : {}),
          },
        });
      expect(
        calls.some((call) => call.event.kind === "message.completed"),
      ).toBe(origin === "assistant");
      const entries = (await conversation.entries({}, 100, undefined, context))
        .items;
      if (origin === "direct") {
        const result = entries.find(DirectToolResultEntry.is)!;
        expect(result.model).toBeUndefined();
        expect(result.data).toMatchObject({
          callId: "actual-tool-call",
          name: tool.name,
          result: {
            isError,
            details: { source: origin, returnValue: "committed input" },
          },
        });
        expect(entries.some((entry) => entry.kind === "pi.assistant")).toBe(
          false,
        );
      } else {
        const result = entries.find(ToolResultEntry.is)!;
        expect(result.model).toMatchObject([
          {
            role: "toolResult",
            toolCallId: "actual-tool-call",
            details: { source: origin, returnValue: "committed input" },
          },
        ]);
      }
    },
  );
  it.each([
    { policy: "all" as const, loseStart: false },
    { policy: "notify-only" as const, loseStart: false },
    { policy: "all" as const, loseStart: true },
  ])(
    "routes authenticated invocation debt to its primary journal with $policy policy and lost start $loseStart",
    async ({ policy, loseStart }) => {
      const owner = {
        runtimeId: "do:workers/native:Agent:one",
        contextId: "context:one",
        incarnation: "storage:one",
        authoritySessionId: "lifetime:one",
      };
      const image = {
        runtimeId: owner.runtimeId,
        source: "workers/native",
        className: "Agent",
        objectKey: "one",
        executionDigest: "a".repeat(64),
      };
      const callHost: AgentHostCall = async <T>() =>
        ({
          id: owner.runtimeId,
          authoritySessionId: owner.authoritySessionId,
          kind: "do",
          status: "active",
          source: { repoPath: image.source, effectiveVersion: "state:one" },
          contextId: owner.contextId,
          className: image.className,
          key: image.objectKey,
          activeExecutionDigest: image.executionDigest,
          agentBinding: {
            entityId: owner.runtimeId,
            contextId: owner.contextId,
            channelId: "channel:primary",
          },
          createdAt: 1,
          cleanupComplete: false,
        }) as T;
      const rpc: RpcClient = {
        selfId: owner.runtimeId,
        expose() {},
        exposeAll() {},
        exposeStreaming() {},
        async call<T>() {
          return null as T;
        },
        async stream() {
          throw new Error("Unexpected stream");
        },
        async streamReadable() {
          throw new Error("Unexpected stream");
        },
        async emit() {},
        on: () => () => {},
        peer() {
          throw new Error("Unexpected peer");
        },
        status: () => "connected",
        ready: () => Promise.resolve(),
        onStatusChange: () => () => {},
      };
      const calls: {
        channel: string;
        participant: string;
        event: AgenticEvent;
        key: string;
      }[] = [];
      const accepted = new Map<string, number>();
      const terminalEntered = gate();
      const acceptTerminal = gate();
      const publish: Parameters<
        typeof createNativeChannelPublication
      >[0]["publish"] = async (channel, participant, event, key) => {
        calls.push({ channel, participant, event, key });
        if (
          event.kind === "invocation.completed" &&
          policy === "all" &&
          !loseStart
        ) {
          terminalEntered.resolve();
          await acceptTerminal.promise;
        }
        if (!accepted.has(key)) accepted.set(key, accepted.size + 1);
        expect(agenticEventSchema.safeParse(event).success).toBe(true);
        if (loseStart && event.kind === "invocation.started" &&
          calls.filter((call) => call.event.kind === "invocation.started").length === 1)
          throw new Error("Native start acceptance reply lost");
        return { id: accepted.get(key)! };
      };
      const publication = createNativeChannelPublication({ publish });
      const models = createModels();
      const faux = fauxProvider();
      models.setProvider(faux.provider);
      faux.setResponses([fauxAssistantMessage("secondary reply")]);
      const registry = createRegistry();
      registry.install(
        defineExtension({ name: "publication", tasks: [publication.task] }),
      );
      let harness!: Harness;
      harness = await openBoundAgentSession(
        new MemoryStorage(),
        owner,
        {
          models,
          registry,
          publishWake: async () => {},
          prepareCommit: publication.prepareCommit,
          modelRequests: async (request, api, context) => {
            await bindNativeModelInvocation(
              {
                harness,
                image,
                callHost,
                rpc,
                publishStart: async (channel, event, key, context) => {
                  const acceptance = await publish(
                    channel,
                    owner.runtimeId,
                    event,
                    key,
                    context,
                  );
                  if (!("id" in acceptance))
                    throw new Error(
                      "Invocation start requires canonical event acceptance",
                    );
                  return acceptance;
                },
              },
              request,
              api,
              context,
            );
            return { status: "ready", options: {}, close: async () => {} };
          },
        },
        context,
      );
      sessions.push(harness);
      const conversation = await harness.root(context, {
        agent: { model: { provider: "faux", modelId: faux.getModel().id } },
      });
      await conversation.commit(
        (tx) =>
          publication.bind(tx, conversation.id, {
            ...binding,
            channelId: "channel:secondary",
            participantId: owner.runtimeId,
            actor: { kind: "agent", id: owner.runtimeId },
            policy,
          }),
        context,
      );
      await conversation.submit({ type: "input", content: "hello" }, context);
      const running = harness.runPass(context);
      try {
        if (policy === "all" && !loseStart) {
          await terminalEntered.promise;
          expect(
            calls.some((call) => call.event.kind === "message.completed"),
          ).toBe(false);
        }
      } finally {
        acceptTerminal.resolve();
        await running;
      }
      const messages = calls.filter(
        (call) => call.event.kind === "message.completed",
      );
      expect(messages).toHaveLength(policy === "all" && !loseStart ? 1 : 0);
      if (messages.length)
        expect(messages[0]!.channel).toBe("channel:secondary");
      const invocation = calls.filter((call) =>
        call.event.kind.startsWith("invocation."),
      );
      expect(invocation.map((call) => call.channel)).toEqual([
        "channel:primary",
        "channel:primary",
        "channel:primary",
      ]);
      expect(
        invocation.every((call) => call.participant === owner.runtimeId),
      ).toBe(true);
      expect(invocation[0]!.event).toEqual(invocation[1]!.event);
      expect(invocation[0]!.key).toBe(invocation[1]!.key);
      expect(invocation[2]!.event.kind).toBe(
        loseStart ? "invocation.failed" : "invocation.completed",
      );
      if (loseStart)
        expect(invocation[2]!.event.payload).toMatchObject({
          terminalOutcome: "infrastructure_error",
          reason: "Native start acceptance reply lost",
          failure: { kind: "infrastructure" },
        });
      const terminalDebt = (await publicationTasks(harness)).find((task) => {
        const input = task.input;
        return (
          input !== null &&
          typeof input === "object" &&
          !Array.isArray(input) &&
          input["terminal"] !== null
        );
      });
      const terminalInput = terminalDebt?.input;
      if (
        terminalInput === null ||
        typeof terminalInput !== "object" ||
        Array.isArray(terminalInput)
      )
        throw new Error("Missing canonical terminal publication input");
      expect(invocation[2]!.event.createdAt).toBe(
        terminalInput["terminalCreatedAt"],
      );
      expect(invocation[2]!.event.causality?.invocationId).toBe(
        invocation[0]!.event.causality?.invocationId,
      );
    },
  );
  it("canonical input placement and mandatory source-channel read publication share one accepted batch and rollback together", async () => {
    class ReadRejectingStorage extends MemoryStorage {
      reject = true;
      readonly original = new StorageRejected("Read placement batch rejected");
      readonly batches: (readonly StorageWrite[])[] = [];
      override async commit(
        writes: readonly StorageWrite[],
        ctx: Parameters<Storage["commit"]>[1],
      ) {
        const isRead = writes.some(
          (write) =>
            write.type === "task" &&
            write.value.kind === "vibestudio.channel-publication",
        );
        const isPlacement = writes.some(
          (write) => write.type === "entry" && write.value.kind === "pi.user",
        );
        if (isRead && isPlacement && this.reject) {
          this.reject = false;
          throw this.original;
        }
        this.batches.push(writes);
        return super.commit(writes, ctx);
      }
    }
    const storage = new ReadRejectingStorage();
    const accepted: {
      channelId: string;
      participantId: string;
      event: AgenticEvent;
      key: string;
    }[] = [];
    const lostReadAck = new Error(
      "Canonical read receipt recorded but acknowledgement was lost",
    );
    let loseReadAck = true;
    const publication = createNativeChannelPublication({
      publish: async (channelId, participantId, event, key) => {
        accepted.push({ channelId, participantId, event, key });
        if (event.kind === "message.read" && loseReadAck) {
          loseReadAck = false;
          throw lostReadAck;
        }
        return event.kind === "message.read"
          ? { recorded: true as const }
          : { id: accepted.length };
      },
    });
    const registry = createRegistry();
    registry.install(
      defineExtension({ name: "read-publication", tasks: [publication.task] }),
    );
    const models = createModels();
    const faux = fauxProvider();
    models.setProvider(faux.provider);
    const owner = {
      runtimeId: "do:worker:Agent:read",
      contextId: "context:read",
      incarnation: "incarnation:read",
      authoritySessionId: "authority:read",
    };
    const harness = await openBoundAgentSession(
      storage,
      owner,
      {
        models,
        registry,
        publishWake: async () => {},
        prepareCommit: publication.prepareCommit,
        modelRequests: async (request) => ({
          status: "waiting",
          condition: {
            kind: "input",
            conversationId: request.conversationId,
            after: request.cutoff,
            kinds: ["test.read-model-ready"],
          },
        }),
      },
      context,
    );
    sessions.push(harness);
    const target = {
      channelId: "channel:response",
      contextId: owner.contextId,
    };
    const conversation = await openNativeChannelConversation(
      harness,
      target,
      { model: { provider: "faux", modelId: faux.getModel().id } },
      context,
      (tx, id) =>
        publication.bind(tx, id, {
          ...binding,
          channelId: target.channelId,
          policy: "notify-only",
        }),
    );
    const original: NativeChannelDelivery = {
      deliveryId: "read-delivery",
      channelId: "channel:source",
      channelRef: {
        source: "workers/channel",
        className: "ChannelDO",
        objectKey: "channel:source",
      },
      participantId: "participant:read-owner",
      subscriptionRevision: 1,
      eventSequence: 1,
      envelope: {
        kind: "log",
        event: {
          id: 1,
          messageId: "source-event:read",
          type: "agentic.trajectory.v1/event",
          senderId: "user:one",
          payload: {
            kind: "message.completed",
            actor: { kind: "user", id: "one" },
            causality: { messageId: "message:read" },
            payload: {
              protocol: "agentic.trajectory.v1",
              role: "user",
              blocks: [
                {
                  type: "text",
                  blockId: "message:read:block",
                  content: "read me",
                },
              ],
              outcome: "completed",
            },
            createdAt: "2026-10-01T00:00:00.000Z",
          },
        },
      },
      agenticContext: {
        version: 1,
        relationships: [],
        channelConfig: {},
        conversation: {
          lastCompletedSender: null,
          lastCompletedMessageId: null,
          lastCompletedSeq: null,
          previousCompletedSender: null,
          previousCompletedSeq: null,
          previousCompletedMessageId: null,
          agentStreak: 0,
        },
        replyToSenderId: null,
      },
    };
    await expect(
      submitNativeChannelDelivery(
        harness,
        target,
        original,
        { kind: "input", content: "read me" },
        context,
      ),
    ).rejects.toBe(storage.original);
    expect(
      await retainedNativeChannelSourceMessage(
        harness,
        original,
        "message:read",
        context,
      ),
    ).toBeNull();
    expect(accepted).toEqual([]);
    const admitted = await submitNativeChannelDelivery(
      harness,
      target,
      original,
      { kind: "input", content: "read me" },
      context,
    );
    const record = await storage.submission(admitted.submissionId, context);
    const batch = storage.batches.find((writes) =>
      writes.some(
        (write) => write.type === "entry" && write.value.id === record?.entry,
      ),
    );
    expect(batch).toBeDefined();
    expect(
      batch?.some(
        (write) =>
          write.type === "task" &&
          write.value.kind === "vibestudio.channel-publication",
      ),
    ).toBe(true);
    expect(
      await retainedNativeChannelSourceMessage(
        harness,
        original,
        "message:read",
        context,
      ),
    ).toMatchObject({ entryId: record?.entry, readProjected: true });
    await harness.runPass(context);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({
      channelId: "channel:source",
      participantId: original.participantId,
      event: {
        kind: "message.read",
        actor: binding.actor,
        causality: { messageId: "message:read" },
      },
    });
    expect(agenticEventSchema.safeParse(accepted[0]!.event).success).toBe(true);
    const failed = (await publicationTasks(harness))[0]!;
    expect(failed.state).toMatchObject({
      status: "waiting",
      condition: { kind: "failure" },
    });
    await expect(harness.waitForTask(failed.id, context)).rejects.toThrow(
      lostReadAck.message,
    );
    if (
      failed.state.status !== "waiting" ||
      failed.state.condition.kind !== "failure"
    )
      throw new Error("No retained read repair incident");
    await harness.runPass(context);
    expect(accepted).toHaveLength(1);
    expect(
      await harness.retryTask(
        failed.id,
        failed.state.condition.incident,
        context,
      ),
    ).toBe("queued");
    await harness.runPass(context);
    expect(accepted).toHaveLength(2);
    expect(accepted[1]).toEqual(accepted[0]);
    await submitNativeChannelDelivery(
      harness,
      target,
      { ...original, deliveryId: "read-reattached", subscriptionRevision: 3 },
      { kind: "input", content: "later selection" },
      context,
    );
    await harness.runPass(context);
    expect(accepted).toHaveLength(2);
    expect(conversation.id).toBe(admitted.conversationId);
  });
});
