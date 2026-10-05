import { afterEach, describe, expect, it, vi } from "vitest";
import { createModels } from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  defineExtension,
  MemoryStorage,
  StorageRejected,
  type Harness,
  type Storage,
  type StorageWrite,
  type SubmissionId,
  type SettledSubmissionRecord,
} from "@panticonic/pi-durable";
import { openBoundAgentSession } from "./native-agent-session.js";
import { recordNativeProductInput } from "./native-product-context.js";
import { createNativeInputSettlement } from "./native-input-settlement.js";
const context = BACKGROUND_CONTEXT;
const owner = {
  runtimeId: "do:workers/native:Agent:one",
  contextId: "context:one",
  incarnation: "storage:one",
  authoritySessionId: "lifetime:one",
};
const sessions: Harness[] = [];
afterEach(async () => {
  for (const result of await Promise.allSettled(
    sessions.splice(0).map((h) => h.close(context)),
  ))
    if (result.status === "rejected") throw result.reason;
});
class RejectingStorage extends MemoryStorage {
  reject = false;
  rejectTerminal = false;
  readonly original = new StorageRejected("Settlement batch rejected");
  override async commit(
    writes: readonly StorageWrite[],
    ctx: Parameters<Storage["commit"]>[1],
  ) {
    if (
      this.reject &&
      writes.some(
        (w) =>
          w.type === "task" && w.value.kind === "vibestudio.input-settlement",
      )
    ) {
      this.reject = false;
      throw this.original;
    }
    if (
      this.rejectTerminal &&
      writes.some(
        (write) =>
          write.type === "task" &&
          write.value.kind === "vibestudio.input-settlement" &&
          write.value.state.status === "terminal",
      )
    ) {
      this.rejectTerminal = false;
      throw this.original;
    }
    return super.commit(writes, ctx);
  }
}
async function fixture(
  onSettled: Parameters<
    typeof createNativeInputSettlement
  >[0]["onSettled"] = vi.fn(async () => {}),
  storage = new RejectingStorage(),
) {
  const settlement = createNativeInputSettlement({ onSettled });
  const registry = createRegistry();
  registry.install(
    defineExtension({ name: "settlement", tasks: [settlement.task] }),
  );
  const harness = await openBoundAgentSession(
    storage,
    owner,
    {
      models: createModels(),
      registry,
      publishWake: async () => {},
      prepareCommit: (tx, staged) => settlement.prepareCommit(tx, staged),
    },
    context,
  );
  sessions.push(harness);
  const conversation = await harness.createConversation(
    { ownership: { kind: "ownerless" } },
    context,
  );
  async function settle(requestId = "input:one") {
    let id!: SubmissionId;
    await conversation.commit(async (tx) => {
      const input = await tx.createSubmission({
        conversationId: conversation.id,
        type: "input",
        status: "queued",
        requestId,
      });
      id = input.id;
      await recordNativeProductInput(tx, id, "channel:one", {
        domain: {
          kind: "examples.adventure-moment",
          data: { gameKey: "journey", turnId: "original" },
        },
      });
      tx.settleSubmission(id, {
        status: "unanswered",
        reason: "Explicitly cancelled",
      });
    }, context);
    return id;
  }
  return { harness, storage, conversation, settlement, settle, onSettled };
}
async function tasks(h: Harness) {
  return (await h.inspect(context)).tasks
    .map((task) => task.record)
    .filter((t) => t.kind === "vibestudio.input-settlement");
}
describe("native input settlement notification ownership", () => {
  it("commits one notification with the genuine terminal input and immutable original product metadata", async () => {
    const called = vi.fn(async () => {});
    const f = await fixture(called);
    const id = await f.settle();
    const retained = (await f.harness.submission(id, context))!;
    expect(await retained.status(context)).toMatchObject({
      id,
      status: "unanswered",
    });
    expect(await tasks(f.harness)).toHaveLength(1);
    await f.harness.runPass(context);
    expect(called).toHaveBeenCalledTimes(1);
    expect(called.mock.calls[0]).toEqual([
      "channel:one",
      expect.objectContaining({
        id,
        conversationId: f.conversation.id,
        type: "input",
        status: "unanswered",
        reason: "Explicitly cancelled",
      }),
      {
        domain: {
          kind: "examples.adventure-moment",
          data: { gameKey: "journey", turnId: "original" },
        },
      },
      expect.anything(),
    ]);
    expect(await tasks(f.harness)).toHaveLength(0);
  });
  it("deduplicates the actual task link without inventing a second input status", async () => {
    const f = await fixture();
    const id = await f.settle();
    const submission = await (await f.harness.submission(id, context))!.status(
      context,
    );
    await f.conversation.commit(
      (tx) =>
        f.settlement.prepareCommit(tx, {
          entries: [],
          tasks: [],
          submissions: [submission],
          task: async () => { throw new Error("Input settlement must not read task candidates"); },
        }),
      context,
    );
    expect(await tasks(f.harness)).toHaveLength(1);
    expect(
      await (await f.harness.submission(id, context))!.status(context),
    ).toEqual(submission);
  });
  it("rejects terminal settlement and notification together when storage refuses the native batch", async () => {
    const f = await fixture();
    f.storage.reject = true;
    await expect(f.settle()).rejects.toBe(f.storage.original);
    expect(await tasks(f.harness)).toEqual([]);
    expect((await f.harness.inspect(context)).submissions).toEqual([]);
    expect(f.onSettled).not.toHaveBeenCalled();
    await f.settle();
    expect(await tasks(f.harness)).toHaveLength(1);
  });
  it("retains the original callback failure and requires explicit repair of that exact task incident", async () => {
    const original = new Error("Domain receipt refused");
    let failed = true;
    const called = vi.fn(async () => {
      if (failed) throw original;
    });
    const f = await fixture(called);
    await f.settle();
    await f.harness.runPass(context);
    const parked = (await tasks(f.harness))[0]!;
    expect(parked.state.status).toBe("waiting");
    await expect(f.harness.waitForTask(parked.id, context)).rejects.toThrow(
      original.message,
    );
    await f.harness.runPass(context);
    expect(called).toHaveBeenCalledTimes(1);
    if (
      parked.state.status !== "waiting" ||
      parked.state.condition.kind !== "failure"
    )
      throw new Error("Missing canonical repair incident");
    failed = false;
    await f.harness.retryTask(
      parked.id,
      parked.state.condition.incident,
      context,
    );
    await f.harness.runPass(context);
    expect(called).toHaveBeenCalledTimes(2);
    expect(await tasks(f.harness)).toEqual([]);
  });
  it("retries the same original submission after acceptance loses its native acknowledgement", async () => {
    const accepted = new Set<number>();
    const called = vi.fn(
      async (_channel: string, input: SettledSubmissionRecord) => {
        accepted.add(input.id);
      },
    );
    const f = await fixture(called);
    const id = await f.settle();
    f.storage.rejectTerminal = true;
    await f.harness.runPass(context);
    const parked = (await tasks(f.harness))[0]!;
    expect(accepted).toEqual(new Set([id]));
    if (
      parked.state.status !== "waiting" ||
      parked.state.condition.kind !== "failure"
    )
      throw new Error("Missing acknowledgement repair incident");
    await f.harness.retryTask(
      parked.id,
      parked.state.condition.incident,
      context,
    );
    await f.harness.runPass(context);
    expect(called).toHaveBeenCalledTimes(2);
    expect(accepted.size).toBe(1);
    expect(called.mock.calls.every((call) => call[1].id === id)).toBe(true);
  });
});
