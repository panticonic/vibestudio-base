import { afterEach, describe, expect, it, vi } from "vitest";
import { createModels } from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  defineExtension,
  type Harness,
  type Storage,
  type SubmissionId,
  type SettledSubmissionRecord,
} from "@panticonic/pi-durable";
import { openBoundAgentSession } from "./native-agent-session.js";
import { recordNativeProductInput } from "./native-product-context.js";
import { createNativeInputSettlement } from "./native-input-settlement.js";
import { recoverableStorage } from "./testing/recoverable-storage.js";
const context = BACKGROUND_CONTEXT;
const storageCleanups: (() => Promise<void>)[] = [];
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
  await Promise.all(storageCleanups.splice(0).map((cleanup) => cleanup()));
});
async function fixture(
  onSettled: Parameters<
    typeof createNativeInputSettlement
  >[0]["onSettled"] = vi.fn(async () => {}),
) {
  const fault = { reject: false, rejectTerminal: false, original: new Error("Settlement batch rejected") };
  const store = await recoverableStorage((writes) => {
    if (fault.reject && writes.some((w) => w.type === "task" && w.value.kind === "vibestudio.input-settlement")) {
      fault.reject = false;
      return fault.original;
    }
    if (fault.rejectTerminal && writes.some((w) => w.type === "task" && w.value.kind === "vibestudio.input-settlement" && w.value.state.status === "terminal")) {
      fault.rejectTerminal = false;
      return fault.original;
    }
    return undefined;
  });
  storageCleanups.push(store.cleanup);
  const settlement = createNativeInputSettlement({ onSettled });
  const registry = createRegistry();
  registry.install(
    defineExtension({ name: "settlement", tasks: [settlement.task] }),
  );
  const options: Parameters<typeof openBoundAgentSession>[2] =
    {
      models: createModels(),
      registry,
      publishWake: async () => {},
      prepareCommit: (tx, staged) => settlement.prepareCommit(tx, staged),
    };
  async function reopen(storage: Storage) {
    const harness = await openBoundAgentSession(storage, { ...owner, generation: 1 }, options, context);
    sessions.push(harness);
    return harness;
  }
  let harness = await reopen(store.storage);
  let conversation = await harness.createConversation(
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
  return {
    get harness() { return harness; }, storage: fault, conversation, settlement, settle, onSettled,
    async recover() {
      expect(await harness.closed).toEqual({ reason: "failed", error: fault.original });
      harness = await reopen(await store.reopen());
      const restored = await harness.conversation(conversation.id, context);
      if (!restored) throw new Error("Committed settlement conversation was lost");
      conversation = restored;
    },
  };
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
    await f.recover();
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
    await f.harness.runPass(context).catch((error) => {
      expect(error === f.storage.original || (error as Error).cause === f.storage.original).toBe(true);
    });
    await f.recover();
    expect(accepted).toEqual(new Set([id]));
    await f.harness.runPass(context);
    expect(called).toHaveBeenCalledTimes(2);
    expect(accepted.size).toBe(1);
    expect(called.mock.calls.every((call) => call[1].id === id)).toBe(true);
  });
});
