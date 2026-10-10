import {
  fauxAssistantMessage,
  fauxProvider,
  createModels,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import { copyJson } from "@panticonic/pi-chord";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRegistry,
  defineExtension,
  MemoryStorage,
  type Harness,
  type EntryId,
  type Conversation,
  type Storage,
} from "@panticonic/pi-durable";
import { openNodeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";
import { afterEach, describe, expect, it } from "vitest";
import { openBoundAgentSession } from "./native-agent-session.js";
import { openNativeChannelConversation } from "./native-channel-session.js";
import { createNativeModelReset } from "./native-model-reset.js";
import { nativeProductInput } from "./native-product-context.js";

const context = BACKGROUND_CONTEXT;
const sessions: Harness[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    sessions.splice(0).map((session) => session.close(context)),
  );
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
const resetAt = new Date(10_000).toISOString();
async function fixture(storage: Storage = new MemoryStorage()) {
  const faux = fauxProvider({ provider: "openai-codex" });
  const models = createModels();
  models.setProvider(faux.provider);
  let conversation!: Conversation;
  const reset = createNativeModelReset({
    conversation: async (channelId) => {
      if (channelId !== "channel:one") throw new Error("Unknown owned channel");
      return conversation;
    },
  });
  const registry = createRegistry();
  registry.install(defineExtension({ name: "reset", tasks: [reset.task] }));
  let now = 0;
  async function open(next: Storage) {
    const harness = await openBoundAgentSession(
      next,
      {
        runtimeId: "do:workers/agent:Agent:one",
        authoritySessionId: "lifetime:one",
        contextId: "context:one",
        incarnation: "storage:one",
      },
      {
        models,
        registry,
        now: () => now,
        publishWake: async () => {},
        settings: { retry: { enabled: false } },
      },
      context,
    );
    sessions.push(harness);
    conversation = await openNativeChannelConversation(
      harness,
      { channelId: "channel:one", contextId: "context:one", channelRef: { source: "workers/channel", className: "ChannelDO", objectKey: "channel:one" } },
      { model: { provider: "openai-codex", modelId: "faux-1" } },
      context,
    );
    return harness;
  }
  const harness = await open(storage);
  let calls = 0;
  faux.setResponses([
    () => {
      calls++;
      return fauxAssistantMessage("", {
        timestamp: 0,
        stopReason: "error",
        errorMessage: '{"error":{"type":"usage_limit_reached","resets_at":10}}',
      });
    },
    () => {
      calls++;
      return fauxAssistantMessage("Actual fresh checkup response");
    },
  ]);
  const original = await conversation.submit(
    { type: "input", content: "Original work" },
    context,
  );
  expect((await original.wait(context)).status).toBe("unanswered");
  const failed = (
    await conversation.entries({}, 100, undefined, context)
  ).items.find((entry) => entry.kind === "pi.assistant");
  if (!failed) throw new Error("Fixture lost its actual failed assistant");
  return {
    reset,
    harness,
    conversation,
    entryId: failed.id,
    calls: () => calls,
    advance: (value: number) => {
      now = value;
    },
    reopen: async (next: Storage) => ({
      harness: await open(next),
      conversation,
    }),
  };
}
async function inputs(conversation: Conversation) {
  return (await conversation.entries({}, 100, undefined, context)).items.filter(
    (entry) => entry.kind === "pi.user",
  );
}
describe("native provider deadline checkup", () => {
  it("recovers a real SQLite accepted checkup with a lost admission reply without another input or model request", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-model-reset-"));
    directories.push(directory);
    const path = join(directory, "state.sqlite");
    const storage = await openNodeSqliteStorage(path);
    const original = new Error("Original accepted reset admission reply lost");
    let lose = true;
    const commit: Storage["commit"] = async (writes, ctx) => {
      const seq = await storage.commit(writes, ctx);
      if (
        lose &&
        writes.some(
          (write) =>
            write.type === "submission" &&
            write.value.type === "input" &&
            write.value.requestId?.startsWith("model-reset:") &&
            write.value.status === "placed",
        )
      ) {
        lose = false;
        throw original;
      }
      return seq;
    };
    const intercepted = new Proxy(storage, {
      get(target, key) {
        if (key === "commit") return commit;
        const value: unknown = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const f = await fixture(intercepted);
    const scheduled = await f.reset.schedule(
      "channel:one",
      { entryId: f.entryId, resetAt },
      context,
    );
    await f.harness.runPass(context);
    f.advance(10_000);
    try {
      await f.harness.runPass(context);
    } catch {
      /* The failed storage acknowledgement is joined below. */
    }
    expect(lose).toBe(false);
    sessions.splice(sessions.indexOf(f.harness), 1);
    await f.harness.close(context).catch(() => {});
    const replacement = await f.reopen(await openNodeSqliteStorage(path));
    await replacement.harness.runPass(context);
    await replacement.conversation.waitForIdle(context);
    expect(f.calls()).toBe(2);
    expect(await inputs(replacement.conversation)).toHaveLength(2);
    expect(
      (
        await replacement.harness.getTask(
          scheduled.nativeTaskId as Parameters<Harness["getTask"]>[0],
          context,
        )
      )?.state,
    ).toMatchObject({ status: "terminal", outcome: { status: "completed" } });
  });
  it("waits for the actual external deadline, admits one fresh input, and deduplicates the original failed response", async () => {
    const f = await fixture();
    const scheduled = await f.reset.schedule(
      "channel:one",
      { entryId: f.entryId, resetAt },
      context,
    );
    expect(scheduled).toMatchObject({ scheduled: true, wakeAt: resetAt });
    expect(
      await f.reset.schedule(
        "channel:one",
        { entryId: f.entryId, resetAt },
        context,
      ),
    ).toEqual(scheduled);
    await f.harness.runPass(context);
    expect(f.calls()).toBe(1);
    expect(
      (
        await f.harness.getTask(
          scheduled.nativeTaskId as Parameters<Harness["getTask"]>[0],
          context,
        )
      )?.state,
    ).toMatchObject({
      status: "waiting",
      condition: { kind: "time", until: 10_000 },
    });
    f.advance(10_000);
    await f.harness.runPass(context);
    await f.conversation.waitForIdle(context);
    expect(f.calls()).toBe(2);
    expect(await inputs(f.conversation)).toHaveLength(2);
    const accepted = await f.conversation.commit(
      (tx) =>
        tx.submissionByRequest(
          f.conversation.id,
          `model-reset:${f.conversation.id}:${f.entryId}`,
        ),
      context,
    );
    if (!accepted)
      throw new Error("Reset did not actually admit its fresh input");
    const product = await f.conversation.commit(
      async (tx) => ({
        metadata: copyJson(
          (await nativeProductInput(tx, accepted.id)).metadata,
        ),
      }),
      context,
    );
    expect(product.metadata).toMatchObject({
      origin: "agent-initiated",
      interaction: { source: "model-reset" },
    });
    expect(product.metadata).not.toHaveProperty("automation");
    await f.reset.schedule(
      "channel:one",
      { entryId: f.entryId, resetAt },
      context,
    );
    await f.harness.runPass(context);
    expect(f.calls()).toBe(2);
  });
  it("cancels the actual deadline task without admitting a fresh input", async () => {
    const f = await fixture();
    const scheduled = await f.reset.schedule(
      "channel:one",
      { entryId: f.entryId, resetAt },
      context,
    );
    await f.harness.runPass(context);
    await f.harness.abortTask(
      scheduled.nativeTaskId as Parameters<Harness["abortTask"]>[0],
      context,
    );
    await f.harness.runPass(context);
    f.advance(10_000);
    await f.harness.runPass(context);
    expect(f.calls()).toBe(1);
    expect(await inputs(f.conversation)).toHaveLength(1);
    expect(
      (
        await f.reset.schedule(
          "channel:one",
          { entryId: f.entryId, resetAt },
          context,
        )
      ).scheduled,
    ).toBe(false);
  });
  it("refuses unknown, foreign and nonfailed source entries or changed provider deadlines", async () => {
    const f = await fixture();
    const before = (await f.harness.inspect(context)).tasks.length;
    expect(
      (
        await f.reset.schedule(
          "channel:one",
          { entryId: 999999 as EntryId, resetAt },
          context,
        )
      ).scheduled,
    ).toBe(false);
    const user = (await inputs(f.conversation))[0]!;
    expect(
      (
        await f.reset.schedule(
          "channel:one",
          { entryId: user.id, resetAt },
          context,
        )
      ).scheduled,
    ).toBe(false);
    expect(
      (
        await f.reset.schedule(
          "channel:one",
          { entryId: f.entryId, resetAt: new Date(11_000).toISOString() },
          context,
        )
      ).scheduled,
    ).toBe(false);
    const foreign = await f.harness.createConversation(
      {
        ownership: { kind: "ownerless" },
        agent: { model: { provider: "openai-codex", modelId: "faux-1" } },
      },
      context,
    );
    const entry = await foreign.commit(
      (tx) =>
        tx.appendEntry(foreign.id, {
          kind: "pi.assistant",
          model: [fauxAssistantMessage("", { stopReason: "error" })],
        }),
      context,
    );
    expect(
      (
        await f.reset.schedule(
          "channel:one",
          { entryId: entry.id, resetAt },
          context,
        )
      ).scheduled,
    ).toBe(false);
    expect((await f.harness.inspect(context)).tasks).toHaveLength(before);
    await expect(
      f.reset.schedule("unknown", { entryId: f.entryId, resetAt }, context),
    ).rejects.toThrow("Unknown owned channel");
  });
});
