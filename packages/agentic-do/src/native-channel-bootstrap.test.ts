import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openNodeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createModels } from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  configure,
  createRegistry,
  defineExtension,
  MemoryStorage,
  StorageRejected,
  type Harness,
  type Storage,
  type StorageWrite,
} from "@panticonic/pi-durable";
import type { ChannelReplayEnvelope } from "@workspace/pubsub";
import { openBoundAgentSession } from "./native-agent-session.js";
import { createNativeChannelBootstrap } from "./native-channel-bootstrap.js";
import {
  NativeChannelOpening,
  lookupNativeChannelConversation,
  recordNativeChannelInputAdmission,
} from "./native-channel-session.js";

const context = BACKGROUND_CONTEXT;
const binding = { channelId: "channel:one", contextId: "context:one" };
const owner = {
  runtimeId: "do:workers/native:Agent:one",
  contextId: binding.contextId,
  incarnation: "storage:one",
  authoritySessionId: "lifetime:one",
};
const intent = { channelId: binding.channelId, revision: 1 };
const sessions: Harness[] = [];
const directories: string[] = [];
afterEach(async () => {
  const results = await Promise.allSettled(
    sessions.splice(0).map((session) => session.close(context)),
  );
  const cleanup = await Promise.allSettled(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
  for (const result of [...results, ...cleanup])
    if (result.status === "rejected") throw result.reason;
});
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
function page(
  ids: number[],
  through = ids.at(-1) ?? 0,
  more = false,
): ChannelReplayEnvelope {
  return {
    mode: "after",
    snapshots: [],
    logEvents: ids.map((id) => ({
      id,
      messageId: `source:${id}`,
      type: "message",
      payload: `history ${id}`,
      senderId: "user:one",
      ts: id,
    })),
    ready: {
      contextId: binding.contextId,
      totalCount: through,
      envelopeCount: ids.length,
      snapshotLastSeq: through,
      replayToId: ids.at(-1),
      hasMoreAfter: more,
    },
  };
}
class RejectingStorage extends MemoryStorage {
  rejectHistory = false;
  rejectImport = false;
  readonly original = new StorageRejected("History batch refused");
  override async commit(
    writes: readonly StorageWrite[],
    ctx: Parameters<Storage["commit"]>[1],
  ) {
    if (
      this.rejectImport &&
      writes.some((write) => write.type === "conversation")
    ) {
      this.rejectImport = false;
      throw this.original;
    }
    if (
      this.rejectHistory &&
      writes.some(
        (write) =>
          write.type === "entry" &&
          write.value.kind === "vibestudio.channel-history",
      )
    ) {
      this.rejectHistory = false;
      throw this.original;
    }
    return super.commit(writes, ctx);
  }
}
async function fixture(
  options: Partial<Parameters<typeof createNativeChannelBootstrap>[0]> = {},
  storage: Storage = new MemoryStorage(),
) {
  const joins = vi.fn(async () => page([1, 2]));
  const replay = vi.fn(async () => page([3, 4], 4));
  const prepare = vi.fn(
    async () =>
      async (
        tx: Parameters<typeof configure>[0],
        conversationId: Parameters<typeof configure>[1],
      ) => {
        await configure(tx, conversationId, {
          instructions: "Configured only after full history",
        });
      },
  );
  const bootstrap = createNativeChannelBootstrap({
    join: joins,
    replayAfter: replay,
    contextForEvent: (_binding, event) => [
      {
        role: "user",
        content: [{ type: "text", text: String(event.payload) }],
        timestamp: event.ts,
      },
    ],
    prepareConfiguration: prepare,
    ...options,
  });
  const registry = createRegistry();
  registry.install(
    defineExtension({ name: "bootstrap", tasks: [bootstrap.task] }),
  );
  const harnessOptions = {
    models: createModels(),
    registry,
    publishWake: async () => {},
  };
  const harness = await openBoundAgentSession(
    storage,
    owner,
    harnessOptions,
    context,
  );
  sessions.push(harness);
  return {
    bootstrap,
    harness,
    joins,
    replay,
    prepare,
    storage,
    harnessOptions,
  };
}
async function history(
  conversation: Awaited<
    ReturnType<ReturnType<typeof createNativeChannelBootstrap>["open"]>
  >,
) {
  return (await conversation.entries({}, 100, undefined, context)).items
    .filter((entry) => entry.kind === "vibestudio.channel-history")
    .sort((a, b) => a.id - b.id);
}
describe("native subscription bootstrap readiness", () => {
  it("keeps the launch receipt and native input behind complete configuration", async () => {
    const configuring = gate();
    const release = gate();
    const f = await fixture({
      prepareConfiguration: async () => {
        configuring.resolve();
        await release.promise;
        return async (tx, id) => {
          await configure(tx, id, { instructions: "Complete" });
        };
      },
    });
    const conversation = await f.bootstrap.open(
      f.harness,
      binding,
      intent,
      context,
    );
    const pass = f.harness.runPass(context);
    await configuring.promise;
    let ready = false;
    const execution = f.bootstrap
      .initialize(f.harness, binding, intent, context)
      .then(() => {
        ready = true;
      });
    try {
      expect(ready).toBe(false);
      expect(f.joins).toHaveBeenCalledTimes(1);
      await expect(
        conversation.submit(
          {
            type: "input",
            requestId: "before-configuration",
            content: async (tx, id) => {
              await recordNativeChannelInputAdmission(tx, conversation.id, id);
              return "new input";
            },
          },
          context,
        ),
      ).rejects.toThrow("initialization has not completed");
    } finally {
      release.resolve();
      await pass;
      await execution;
    }
    expect(ready).toBe(true);
    expect(await history(conversation)).toHaveLength(2);
  });
  it("does not acknowledge membership before the join commits and propagates its original failure", async () => {
    const original = new Error("Membership refused");
    const f = await fixture({
      join: async () => {
        throw original;
      },
    });
    await f.bootstrap.open(f.harness, binding, intent, context);
    const observed = f.bootstrap.initialize(f.harness, binding, intent, context);
    await expect(observed).rejects.toThrow("Membership refused");
  });
  it("retains one actual opening before join; concurrent replay cannot select another intent or prompt against partial context", async () => {
    const held = gate();
    const begun = gate();
    const f = await fixture({
      join: async () => {
        begun.resolve();
        await held.promise;
        return page([1, 2]);
      },
    });
    const conversation = await f.bootstrap.open(
      f.harness,
      binding,
      intent,
      context,
    );
    expect(
      (await f.bootstrap.open(f.harness, binding, intent, context)).id,
    ).toBe(conversation.id);
    const ready = f.bootstrap.ready(f.harness, binding, context);
    const pass = f.harness.runPass(context);
    await begun.promise;
    expect(
      await f.bootstrap.retainedIntent(f.harness, binding, context),
    ).toEqual(intent);
    expect(
      (await lookupNativeChannelConversation(f.harness, binding, context))!.id,
    ).toBe(conversation.id);
    await expect(
      f.bootstrap.open(f.harness, binding, { revision: 2 }, context),
    ).rejects.toThrow("original membership intent");
    await expect(
      conversation.submit(
        {
          type: "input",
          requestId: "early",
          content: async (tx, id) => {
            await recordNativeChannelInputAdmission(tx, conversation.id, id);
            return "too early";
          },
        },
        context,
      ),
    ).rejects.toThrow("initialization has not completed");
    held.resolve();
    await pass;
    expect((await ready).id).toBe(conversation.id);
    expect(await history(conversation)).toHaveLength(2);
    expect((await f.harness.inspect(context)).submissions).toHaveLength(0);
  });
  it("imports canonical paged context only once through its retained cutoff and reattach does not replay", async () => {
    const f = await fixture({ join: async () => page([1, 2], 4, true) });
    const conversation = await f.bootstrap.open(
      f.harness,
      binding,
      intent,
      context,
    );
    await f.bootstrap.ready(f.harness, binding, context);
    expect(f.replay).toHaveBeenCalledWith(
      binding,
      { after: 2, throughSeq: 4 },
      context,
    );
    expect(
      (await history(conversation)).map((entry) => entry.data),
    ).toMatchObject([
      { event: { id: 1 } },
      { event: { id: 2 } },
      { event: { id: 3 } },
      { event: { id: 4 } },
    ]);
    expect(f.prepare).toHaveBeenCalledOnce();
    expect(
      (await f.bootstrap.open(f.harness, binding, { revision: 2 }, context)).id,
    ).toBe(conversation.id);
    await f.bootstrap.ready(f.harness, binding, context);
    expect(await history(conversation)).toHaveLength(4);
    expect(f.prepare).toHaveBeenCalledOnce();
  });
  it("preserves original join failure and explicit repair ownership without manufacturing readiness", async () => {
    const original = new Error("Canonical join failed");
    const f = await fixture({
      join: async () => {
        throw original;
      },
    });
    const conversation = await f.bootstrap.open(
      f.harness,
      binding,
      intent,
      context,
    );
    await expect(f.bootstrap.ready(f.harness, binding, context)).rejects.toBe(
      original,
    );
    expect(
      await f.harness.snapshot(NativeChannelOpening, conversation.id, context),
    ).toMatchObject({ status: "opening" });
    expect(await history(conversation)).toEqual([]);
    expect(f.prepare).not.toHaveBeenCalled();
    expect(
      await f.bootstrap.retainedIntent(f.harness, binding, context),
    ).toEqual(intent);
  });
  it("rejected history commit retains page and frontier; exact repair adds no duplicate prefix", async () => {
    const storage = new RejectingStorage();
    const f = await fixture({}, storage);
    const conversation = await f.bootstrap.open(
      f.harness,
      binding,
      intent,
      context,
    );
    storage.rejectHistory = true;
    await expect(f.bootstrap.ready(f.harness, binding, context)).rejects.toBe(
      storage.original,
    );
    expect(await history(conversation)).toEqual([]);
    const opening = await f.harness.snapshot(
      NativeChannelOpening,
      conversation.id,
      context,
    );
    const failed = (await f.harness.getTask(opening!.taskId!, context))!;
    expect(failed.state).toMatchObject({
      status: "waiting",
      checkpoint: { phase: "history", after: 0 },
    });
    if (
      failed.state.status !== "waiting" ||
      failed.state.condition.kind !== "failure"
    )
      throw new Error("Expected owned failure incident");
    await f.harness.retryTask(
      failed.id,
      failed.state.condition.incident,
      context,
    );
    await f.bootstrap.ready(f.harness, binding, context);
    expect(await history(conversation)).toHaveLength(2);
    expect(f.joins).toHaveBeenCalledOnce();
  });
  it("committed readiness permits original bootstrap activation and exact repair never repeats admission", async () => {
    const original = new Error("Onboarding acknowledgement lost");
    let reject = true;
    let admitted: number | undefined;
    let f!: Awaited<ReturnType<typeof fixture>>;
    const activate = vi.fn(async () => {
      const conversation = await f.bootstrap.ready(f.harness, binding, context);
      expect(
        await f.harness.snapshot(
          NativeChannelOpening,
          conversation.id,
          context,
        ),
      ).toMatchObject({ status: "ready" });
      const submission = await conversation.submit(
        {
          type: "write",
          requestId: "original-onboarding",
          entry: async (tx, id) => {
            await recordNativeChannelInputAdmission(tx, conversation.id, id);
            return {
              kind: "setup-knowledge",
              model: [
                {
                  role: "user" as const,
                  content: "Actual setup knowledge",
                  timestamp: 1,
                },
              ],
            };
          },
        },
        context,
      );
      if (admitted !== undefined) expect(submission.id).toBe(admitted);
      admitted = submission.id;
      if (reject) throw original;
    });
    f = await fixture({ afterConfiguration: activate });
    const conversation = await f.bootstrap.open(
      f.harness,
      binding,
      intent,
      context,
    );
    await f.bootstrap.ready(f.harness, binding, context);
    const opening = await f.harness.snapshot(
      NativeChannelOpening,
      conversation.id,
      context,
    );
    await expect(f.harness.waitForTask(opening!.taskId!, context)).rejects.toBe(
      original,
    );
    const failed = (await f.harness.getTask(opening!.taskId!, context))!;
    expect(failed.state).toMatchObject({
      status: "waiting",
      checkpoint: { phase: "activate" },
    });
    if (
      failed.state.status !== "waiting" ||
      failed.state.condition.kind !== "failure"
    )
      throw new Error("Expected actual activation failure");
    reject = false;
    await f.harness.retryTask(
      failed.id,
      failed.state.condition.incident,
      context,
    );
    await f.harness.waitForTask(failed.id, context);
    expect(activate).toHaveBeenCalledTimes(2);
    expect(f.prepare).toHaveBeenCalledOnce();
    expect(f.joins).toHaveBeenCalledOnce();
  });

  it("activation joins the exact cached pre-ready gate without awaiting its own task settlement", async () => {
    let cached!: Promise<
      Awaited<ReturnType<typeof lookupNativeChannelConversation>>
    >;
    const activate = vi.fn(async () => {
      const conversation = await cached;
      if (!conversation)
        throw new Error("Expected actual channel conversation");
      await conversation.submit(
        {
          type: "write",
          requestId: "cached-gate-onboarding",
          entry: {
            kind: "setup-knowledge",
            model: [{ role: "user", content: "Original setup", timestamp: 1 }],
          },
        },
        context,
      );
    });
    const f = await fixture({ afterConfiguration: activate });
    const conversation = await f.bootstrap.open(
      f.harness,
      binding,
      intent,
      context,
    );
    cached = f.bootstrap.ready(f.harness, binding, context);
    expect((await cached)?.id).toBe(conversation.id);
    const opening = await f.harness.snapshot(
      NativeChannelOpening,
      conversation.id,
      context,
    );
    expect(
      (await f.harness.waitForTask(opening!.taskId!, context)).state.outcome
        .status,
    ).toBe("completed");
    expect(activate).toHaveBeenCalledOnce();
    expect(
      (await conversation.entries({}, 100, undefined, context)).items.filter(
        (entry) => entry.kind === "setup-knowledge",
      ),
    ).toHaveLength(1);
  });

  it("activation replacement resumes the retained bounded page without joining or duplicating the committed prefix", async () => {
    const held = gate();
    const begun = gate();
    const directory = await mkdtemp(join(tmpdir(), "native-bootstrap-"));
    directories.push(directory);
    const path = join(directory, "session.sqlite");
    const f = await fixture(
      {
        prepareConfiguration: async () => {
          begun.resolve();
          await held.promise;
          return async (tx, id) => {
            await configure(tx, id, { instructions: "Recovered" });
          };
        },
      },
      await openNodeSqliteStorage(path),
    );
    const conversation = await f.bootstrap.open(
      f.harness,
      binding,
      intent,
      context,
    );
    const pass = f.harness.runPass(context);
    await begun.promise;
    expect(await history(conversation)).toHaveLength(2);
    const closing = f.harness.close(context);
    held.resolve();
    const joined = await Promise.allSettled([pass, closing]);
    expect(joined[1]!.status).toBe("fulfilled");
    const replacement = await openBoundAgentSession(
      await openNodeSqliteStorage(path),
      owner,
      f.harnessOptions,
      context,
    );
    sessions.push(replacement);
    const restored = await f.bootstrap.ready(replacement, binding, context);
    expect(restored.id).toBe(conversation.id);
    expect(await history(restored)).toHaveLength(2);
    expect(f.joins).toHaveBeenCalledOnce();
  });
  it("explicit withdrawal drains the real context before allowing membership leave and later reattach", async () => {
    const f = await fixture();
    const conversation = await f.bootstrap.open(
      f.harness,
      binding,
      intent,
      context,
    );
    await f.bootstrap.cancel(f.harness, binding, context);
    expect(
      await f.harness.snapshot(NativeChannelOpening, conversation.id, context),
    ).toMatchObject({ status: "ready" });
    expect(await history(conversation)).toHaveLength(2);
    expect(
      (await f.bootstrap.open(f.harness, binding, { revision: 3 }, context)).id,
    ).toBe(conversation.id);
    expect(await history(conversation)).toHaveLength(2);
  });
  it("withdrawal retains the original cleanup failure and cannot claim readiness or successful leave", async () => {
    const original = new Error("Canonical cleanup join failure");
    const f = await fixture({
      join: async () => {
        throw original;
      },
    });
    const conversation = await f.bootstrap.open(
      f.harness,
      binding,
      intent,
      context,
    );
    await expect(f.bootstrap.cancel(f.harness, binding, context)).rejects.toBe(
      original,
    );
    expect(
      await f.harness.snapshot(NativeChannelOpening, conversation.id, context),
    ).toMatchObject({ status: "opening" });
    expect(f.prepare).not.toHaveBeenCalled();
  });
  it("folds canonical edited/retracted/read-wins history into passive native context without turning corrections into prompts", async () => {
    const actor = { kind: "user", id: "user:one" };
    const make = (
      id: number,
      kind: string,
      messageId: string,
      text = "",
      by = actor,
    ) => ({
      id,
      messageId: `source:${id}`,
      type: "agentic.trajectory.v1/event",
      senderId: by.id,
      ts: id,
      payload: {
        kind,
        actor: by,
        causality: { messageId },
        createdAt: "2026-10-01T00:00:00.000Z",
        payload: {
          protocol: "agentic.trajectory.v1",
          ...(kind === "message.completed"
            ? { role: "user", outcome: "completed" }
            : {}),
          ...(kind === "message.edited" || kind === "message.retracted"
            ? { by }
            : {}),
          ...(kind === "message.completed" || kind === "message.edited"
            ? {
                blocks: [{ type: "text", blockId: "block:one", content: text }],
              }
            : {}),
        },
      },
    });
    const events = [
      make(1, "message.completed", "message:a", "original"),
      make(2, "message.edited", "message:a", "corrected"),
      make(3, "message.completed", "message:b", "to retract"),
      make(4, "message.retracted", "message:b"),
      make(5, "message.edited", "message:a", "foreign", {
        kind: "user",
        id: "user:foreign",
      }),
      make(6, "message.read", "message:a", "", {
        kind: "user",
        id: "user:reader",
      }),
      make(7, "message.edited", "message:a", "after read"),
    ];
    const replay = { ...page([], 7), logEvents: events };
    const f = await fixture({
      join: async () => replay,
      contextForEvent: (_binding, event, projected) =>
        projected
          ? [
              {
                role: "user",
                content: (projected.blocks ?? [])
                  .map((block) => ("content" in block ? block.content : ""))
                  .join("\n"),
                timestamp: event.ts,
              },
            ]
          : [],
    });
    const conversation = await f.bootstrap.open(
      f.harness,
      binding,
      intent,
      context,
    );
    await f.bootstrap.ready(f.harness, binding, context);
    const view = await conversation.context(context);
    expect(
      view.messages
        .filter((message) => message.role === "user")
        .map((message) => message.content),
    ).toEqual(["corrected"]);
    expect(await history(conversation)).toHaveLength(7);
    expect(
      (await history(conversation)).map((entry) => entry.data),
    ).toMatchObject(events.map((event) => ({ event })));
    expect(view.entries.some((entry) => entry.kind === "pi.user")).toBe(false);
    expect((await f.harness.inspect(context)).submissions).toEqual([]);
  });
  it("genuine native history import binds opening in the same batch and joins/configures before admitting live input", async () => {
    const source = await fixture();
    const original = await source.harness.root(context);
    const entry = await original.commit(
      (tx) =>
        tx.appendEntry(original.id, {
          kind: "knowledge",
          model: [
            {
              role: "user",
              content: "Native imported knowledge",
              timestamp: 1,
            },
          ],
        }),
      context,
    );
    const knowledge = await original.exportHistory(entry.id, context);
    const held = gate();
    const begun = gate();
    const f = await fixture({
      join: async () => {
        begun.resolve();
        await held.promise;
        return page([9]);
      },
    });
    const imported = await f.harness.importHistory(
      knowledge,
      {
        ownership: { kind: "ownerless" },
        init: (tx, id) =>
          f.bootstrap.bindImported(tx, id, binding, intent, {
            operationId: "fork:one",
            parentChannelId: "channel:parent",
            throughSequence: 8,
            knowledgeDigest: "a".repeat(64),
          }),
      },
      context,
    );
    const ready = f.bootstrap.ready(f.harness, binding, context);
    await begun.promise;
    try {
      expect(
        (await f.bootstrap.open(f.harness, binding, intent, context)).id,
      ).toBe(imported.id);
      const opening = await f.harness.snapshot(
        NativeChannelOpening,
        imported.id,
        context,
      );
      expect(
        (await f.harness.getTask(opening!.taskId!, context))!.input,
      ).toMatchObject({
        history: {
          kind: "native-import",
          operationId: "fork:one",
          throughSequence: 8,
        },
      });
      expect(
        (await imported.context(context)).messages.map(
          (message) => message.content,
        ),
      ).toEqual(["Native imported knowledge"]);
      await expect(
        imported.submit(
          {
            type: "input",
            requestId: "before-import-ready",
            content: async (tx, id) => {
              await recordNativeChannelInputAdmission(tx, imported.id, id);
              return "early";
            },
          },
          context,
        ),
      ).rejects.toThrow("initialization has not completed");
      expect(
        await f.bootstrap.retainedIntent(f.harness, binding, context),
      ).toEqual(intent);
    } finally {
      held.resolve();
    }
    expect((await ready).id).toBe(imported.id);
    expect(await history(imported)).toEqual([]);
    expect(f.replay).not.toHaveBeenCalled();
    expect(f.prepare).toHaveBeenCalledOnce();
    expect(f.prepare).toHaveBeenCalledWith(binding, intent, expect.anything(), {
      kind: "native-import",
      operationId: "fork:one",
      parentChannelId: "channel:parent",
      throughSequence: 8,
      knowledgeDigest: "a".repeat(64),
    });
    expect(
      (await imported.context(context)).messages
        .filter((message) => message.role === "user")
        .map((message) => message.content),
    ).toEqual(["Native imported knowledge"]);
  });
  it("rejected genuine import rolls back history, directory and native opening task together", async () => {
    const source = await fixture();
    const original = await source.harness.root(context);
    const entry = await original.commit(
      (tx) =>
        tx.appendEntry(original.id, {
          kind: "knowledge",
          data: { original: true },
        }),
      context,
    );
    const knowledge = await original.exportHistory(entry.id, context);
    const storage = new RejectingStorage();
    const f = await fixture({}, storage);
    storage.rejectImport = true;
    await expect(
      f.harness.importHistory(
        knowledge,
        {
          ownership: { kind: "ownerless" },
          init: (tx, id) =>
            f.bootstrap.bindImported(tx, id, binding, intent, {
              operationId: "fork:rollback",
              parentChannelId: "channel:parent",
              throughSequence: 8,
              knowledgeDigest: "b".repeat(64),
            }),
        },
        context,
      ),
    ).rejects.toBe(storage.original);
    expect(
      await lookupNativeChannelConversation(f.harness, binding, context),
    ).toBeNull();
    expect(
      (await f.harness.commit((tx) => tx.scanTasks({}, 100), context)).items,
    ).toEqual([]);
    expect(f.joins).not.toHaveBeenCalled();
  });
  it("rejects a changed page horizon without accepting partial history or configuring a model", async () => {
    const f = await fixture({
      join: async () => page([1, 2], 4, true),
      replayAfter: async () => page([3, 4], 5),
    });
    const conversation = await f.bootstrap.open(
      f.harness,
      binding,
      intent,
      context,
    );
    await expect(
      f.bootstrap.ready(f.harness, binding, context),
    ).rejects.toThrow("retained horizon");
    expect(await history(conversation)).toEqual([]);
    expect(f.prepare).not.toHaveBeenCalled();
  });
});
