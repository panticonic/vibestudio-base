import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModels } from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  defineExtension,
  Harness,
  MemoryStorage,
  ReceiptDoc,
  type Storage,
} from "@panticonic/pi-durable";
import { openNodeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";
import {
  bindEvalRun,
  createNativeEvalAcknowledgements,
  createNativeEvalAwait,
  ensureEvalAwaitTask,
  evalSessionId,
  recordEvalAdmission,
  retainedEvalAdmission,
  retainObservedEvalReceipt,
  type EvalSessionRpc,
} from "./native-eval-receipts.js";
import { recoverableStorage } from "./testing/recoverable-storage.js";
const context = BACKGROUND_CONTEXT;
const storageCleanups: (() => Promise<void>)[] = [];
const receipt = {
  runId: "run:one",
  runDigest: "a".repeat(64),
  resultDigest: "b".repeat(64),
  result: { success: true, console: "actual domain output", returnValue: 42 },
  acknowledged: false,
};
const sessions: Harness[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    sessions.splice(0).map((session) => session.close(context)),
  );
  await Promise.all(storageCleanups.splice(0).map((cleanup) => cleanup()));
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
const OWNER = "do:workers/agent:Agent:one";
const sessionId = evalSessionId(OWNER, undefined);
const progress: unknown[] = [];
async function fixture(
  call: EvalSessionRpc,
  storage: Storage = new MemoryStorage(),
  recordAccepted = true,
) {
  progress.length = 0;
  const acknowledgements = createNativeEvalAcknowledgements({
    rpc: call,
    ownerId: () => OWNER,
  });
  const awaiting = createNativeEvalAwait({
    rpc: call,
    ownerId: () => OWNER,
    acknowledgements,
    onEvents: async (_input, events) => {
      progress.push(...events);
    },
    waitMs: 5,
    cycleMs: 30,
    pauseMs: 5,
  });
  const registry = createRegistry();
  registry.install(
    defineExtension({
      name: "eval-ack",
      tasks: [acknowledgements.task, awaiting.task],
    }),
  );
  const options = { registry, models: createModels() };
  const harness = await Harness.open(storage, options, context);
  sessions.push(harness);
  const conversation = await harness.root(context);
  await harness.commit(async (tx) => {
    await bindEvalRun(
      tx,
      receipt.runId,
      "binding:one",
      { runId: receipt.runId },
      conversation.id,
    );
    if (recordAccepted)
      await recordEvalAdmission(tx, receipt.runId, {
        runId: receipt.runId,
        runDigest: receipt.runDigest,
        authorityManifestDigest: "c".repeat(64),
        status: "accepted",
      });
  }, context);
  return { harness, acknowledgements, awaiting, options };
}
async function tasks(harness: Harness) {
  return (
    await harness.commit((tx) => tx.scanTasks({}, 100), context)
  ).items.filter((task) => task.kind === "vibestudio.eval-acknowledgement");
}
describe("native Eval acknowledgement ownership", () => {
  it("the await task pulls canonical completion through the original route after losing its start response", async () => {
    const calls: Array<[string, string]> = [];
    const call = schemaRpcMock({
      call: async (target: string, method: string) => {
        calls.push([target, method]);
        if (method === "await") return { status: "done" };
        if (method === "events") return { events: [], next: 0, hasMore: false };
        if (method === "receipt") return receipt;
        if (method === "dynamicCode.release") return { released: true };
        return { acknowledged: true, duplicate: false };
      },
    });
    const f = await fixture(call, new MemoryStorage(), false);
    await f.harness.commit(
      (tx) => ensureEvalAwaitTask(tx, receipt.runId, f.awaiting),
      context,
    );
    const awaiting = (await retainedEvalAdmission(f.harness, receipt.runId, context))!
      .awaiting!;
    expect((await f.harness.waitForTask(awaiting, context)).state.outcome.status).toBe(
      "completed",
    );
    expect(
      (await f.harness.snapshot(ReceiptDoc, receipt.runId, context))?.result,
    ).toEqual(receipt.result);
    const debt = (await tasks(f.harness))[0]!;
    await f.harness.waitForTask(debt.id, context);
    expect(calls.map(([, method]) => method)).toEqual([
      "await",
      "events",
      "receipt",
      "dynamicCode.release",
      "acknowledge",
    ]);
    // Every pull of the run is a call on the entity that hosts its kernel.
    for (const [target, method] of calls)
      if (!method.startsWith("dynamicCode.")) expect(target).toBe(sessionId);
    expect(await tasks(f.harness)).toHaveLength(1);
  });
  it("keeps a run's pulled events in order across polls and hands each over once", async () => {
    let polls = 0;
    const events = [
      { sequence: 1, at: 1, kind: "console", payload: { text: "a" } },
      { sequence: 2, at: 2, kind: "console", payload: { text: "b" } },
    ];
    const after: number[] = [];
    const call = schemaRpcMock({
      call: async (_target: string, method: string, args: unknown[]) => {
        if (method === "await") return { status: ++polls >= 3 ? "done" : "running" };
        if (method === "events") {
          const from = (args[1] as { after: number }).after;
          after.push(from);
          const rest = events.filter((event) => event.sequence > from);
          return { events: rest, next: rest.at(-1)?.sequence ?? from, hasMore: false };
        }
        if (method === "receipt") return receipt;
        if (method === "dynamicCode.release") return { released: true };
        return { acknowledged: true, duplicate: false };
      },
    });
    const f = await fixture(call);
    await f.harness.commit(
      (tx) => ensureEvalAwaitTask(tx, receipt.runId, f.awaiting),
      context,
    );
    const awaiting = (await retainedEvalAdmission(f.harness, receipt.runId, context))!
      .awaiting!;
    await f.harness.waitForTask(awaiting, context);
    expect(progress).toEqual(events);
    expect(after[0]).toBe(0);
    expect(after.slice(1).every((value) => value === 2)).toBe(true);
  });
  it("continues after the last handed-over event when the owner restarts mid-run", async () => {
    let terminal = false;
    const events = [
      { sequence: 1, at: 1, kind: "console", payload: { text: "a" } },
      { sequence: 2, at: 2, kind: "console", payload: { text: "b" } },
    ];
    const call = schemaRpcMock({
      call: async (_target: string, method: string, args: unknown[]) => {
        if (method === "await") {
          if (terminal) return { status: "done" };
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { status: "running" };
        }
        if (method === "events") {
          const from = (args[1] as { after: number }).after;
          const rest = events.filter((event) => event.sequence > from);
          return { events: rest, next: rest.at(-1)?.sequence ?? from, hasMore: false };
        }
        if (method === "receipt") return receipt;
        if (method === "dynamicCode.release") return { released: true };
        return { acknowledged: true, duplicate: false };
      },
    });
    const directory = await mkdtemp(join(tmpdir(), "native-eval-await-"));
    directories.push(directory);
    const path = join(directory, "session.sqlite");
    const f = await fixture(call, await openNodeSqliteStorage(path));
    await f.harness.commit(
      (tx) => ensureEvalAwaitTask(tx, receipt.runId, f.awaiting),
      context,
    );
    const awaiting = (await retainedEvalAdmission(f.harness, receipt.runId, context))!
      .awaiting!;
    f.harness.resume();
    for (let i = 0; i < 200 && progress.length < 2; i++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    expect(progress).toHaveLength(2);
    await f.harness.close(context);
    terminal = true;
    const reopened = await Harness.open(
      await openNodeSqliteStorage(path),
      f.options,
      context,
    );
    sessions.push(reopened);
    await reopened.waitForTask(awaiting, context);
    // The events were not handed over again after the restart; the receipt was accepted once.
    expect(progress).toHaveLength(2);
    expect((await reopened.snapshot(ReceiptDoc, receipt.runId, context))?.result).toEqual(
      receipt.result,
    );
    expect(await tasks(reopened)).toHaveLength(1);
  });
  it.each([
    ["a lost transport", new Error("transport lost"), "time"],
    ["a refusal retrying cannot change", Object.assign(new Error("not your run"), { code: "EACCES" }), "failure"],
  ] as const)("after %s the await task keeps the run's pull", async (_name, failure, expected) => {
    const call = schemaRpcMock({
      call: async (_target: string, method: string) => {
        if (method === "await") throw failure;
        return { acknowledged: true, duplicate: false };
      },
    });
    const f = await fixture(call);
    await f.harness.commit(
      (tx) => ensureEvalAwaitTask(tx, receipt.runId, f.awaiting),
      context,
    );
    const awaiting = (await retainedEvalAdmission(f.harness, receipt.runId, context))!
      .awaiting!;
    f.harness.resume();
    for (
      let i = 0;
      i < 400 &&
      !["waiting", "terminal"].includes(
        (await f.harness.getTask(awaiting, context))?.state.status ?? "",
      );
      i++
    )
      await new Promise((resolve) => setTimeout(resolve, 5));
    const state = (await f.harness.getTask(awaiting, context))?.state;
    // Neither faulted nor terminal: a transport loss sleeps and pulls again; a refusal waits for repair.
    expect(state).toMatchObject({
      status: "waiting",
      condition: { kind: expected },
    });
    if (expected === "time") expect(state).toMatchObject({ checkpoint: { failures: 1 } });
  });
  it("atomically consumes once and gives direct/hint races one exact background debt", async () => {
    const calls: unknown[][] = [];
    let f!: Awaited<ReturnType<typeof fixture>>;
    const call = schemaRpcMock({
      call: async (_target: string, method: string, args: unknown[]) => {
        expect(method).toBe("acknowledge");
        expect(
          (await f.harness.snapshot(ReceiptDoc, receipt.runId, context))
            ?.result,
        ).toEqual(receipt.result);
        calls.push(args);
        return { acknowledged: true, duplicate: false };
      },
    });
    f = await fixture(call);
    // The tool's own read, a cancellation and the await task may all reach the same receipt.
    for (let attempt = 0; attempt < 3; attempt++)
      await retainObservedEvalReceipt(
        f.harness,
        f.harness,
        receipt.runId,
        receipt,
        f.acknowledgements,
        context,
      );
    expect(await tasks(f.harness)).toHaveLength(1);
    await f.harness.waitForTask((await tasks(f.harness))[0]!.id, context);
    expect(calls).toEqual([
      [
        receipt.runId,
        {
          runDigest: receipt.runDigest,
          resultDigest: receipt.resultDigest,
        },
      ],
    ]);
  });
  it("preserves the original lost-ack incident across SQLite reopen and exact repair", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-eval-ack-"));
    directories.push(directory);
    const path = join(directory, "session.sqlite");
    const original = new Error("original acknowledgement response lost");
    let attempts = 0;
    const call = schemaRpcMock({
      call: async (_target: string) => {
        attempts++;
        if (attempts === 1) throw original;
        return { acknowledged: true, duplicate: false };
      },
    });
    const f = await fixture(call, await openNodeSqliteStorage(path));
    await retainObservedEvalReceipt(
      f.harness,
      f.harness,
      receipt.runId,
      receipt,
      f.acknowledgements,
      context,
    );
    const debt = (await tasks(f.harness))[0]!;
    await expect(f.harness.waitForTask(debt.id, context)).rejects.toBe(
      original,
    );
    const failed = await f.harness.getTask(debt.id, context);
    if (
      !failed ||
      failed.state.status !== "waiting" ||
      failed.state.condition.kind !== "failure"
    )
      throw Error("missing retained incident");
    await f.harness.close(context);
    const reopened = await Harness.open(
      await openNodeSqliteStorage(path),
      f.options,
      context,
    );
    sessions.push(reopened);
    await expect(reopened.waitForTask(debt.id, context)).rejects.toThrow(
      original.message,
    );
    expect(attempts).toBe(1);
    await reopened.retryTask(debt.id, failed.state.condition.incident, context);
    expect(
      (await reopened.waitForTask(debt.id, context)).state.outcome.status,
    ).toBe("completed");
    expect(attempts).toBe(2);
  });
  it("joins accepted acknowledgement on native abort instead of discarding debt", async () => {
    let acknowledged = 0;
    const f = await fixture(
      schemaRpcMock({
        call: async (_target: string) => {
          acknowledged++;
          return { acknowledged: true, duplicate: false };
        },
      }),
    );
    await retainObservedEvalReceipt(
      f.harness,
      f.harness,
      receipt.runId,
      receipt,
      f.acknowledgements,
      context,
    );
    const debt = (await tasks(f.harness))[0]!;
    await f.harness.abortTask(debt.id, context);
    expect(
      (await f.harness.waitForTask(debt.id, context)).state.outcome.status,
    ).toBe("completed");
    expect(acknowledged).toBe(1);
  });
  it("does not create a receipt or debt from foreign outcome identity", async () => {
    const f = await fixture(
      schemaRpcMock({
        call: async (_target: string) => ({
          acknowledged: true,
          duplicate: false,
        }),
      }),
    );
    await expect(
      retainObservedEvalReceipt(
        f.harness,
        f.harness,
        receipt.runId,
        { ...receipt, runDigest: "d".repeat(64) },
        f.acknowledgements,
        context,
      ),
    ).rejects.toThrow("conflicts");
    expect(await tasks(f.harness)).toHaveLength(0);
    expect(
      (await f.harness.snapshot(ReceiptDoc, receipt.runId, context))?.result,
    ).toBeUndefined();
  });
  it("rolls back result and background task together when native commit fails", async () => {
    let reject = false;
    const original = new Error("original receipt batch rejected");
    const store = await recoverableStorage(() => {
      if (!reject) return undefined;
      reject = false;
      return original;
    });
    storageCleanups.push(store.cleanup);
    const f = await fixture(
      schemaRpcMock({
        call: async (_target: string) => ({
          acknowledged: true,
          duplicate: false,
        }),
      }),
      store.storage,
    );
    reject = true;
    await expect(
      retainObservedEvalReceipt(
        f.harness,
        f.harness,
        receipt.runId,
        receipt,
        f.acknowledgements,
        context,
      ),
    ).rejects.toBe(original);
    expect(await f.harness.closed).toEqual({ reason: "failed", error: original });
    const recovered = await Harness.open(await store.reopen(), f.options, context);
    sessions.push(recovered);
    expect(await tasks(recovered)).toHaveLength(0);
    expect(
      (await recovered.snapshot(ReceiptDoc, receipt.runId, context))?.result,
    ).toBeUndefined();
    await retainObservedEvalReceipt(
      recovered,
      recovered,
      receipt.runId,
      receipt,
      f.acknowledgements,
      context,
    );
    expect(await tasks(recovered)).toHaveLength(1);
  });
});
