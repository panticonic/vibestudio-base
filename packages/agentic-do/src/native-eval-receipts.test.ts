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
  StorageRejected,
  type Storage,
  type StorageWrite,
} from "@panticonic/pi-durable";
import { openNodeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";
import type { EvalCall } from "@vibestudio/service-schemas/eval";
import {
  bindEvalRun,
  createNativeEvalAcknowledgements,
  recordEvalAdmission,
  retainObservedEvalReceipt,
  consumeEvalReceipt,
} from "./native-eval-receipts.js";
const context = BACKGROUND_CONTEXT;
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
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture(
  call: EvalCall,
  storage: Storage = new MemoryStorage(),
  recordAccepted = true,
) {
  const acknowledgements = createNativeEvalAcknowledgements(call);
  const registry = createRegistry();
  registry.install(
    defineExtension({ name: "eval-ack", tasks: [acknowledgements.task] }),
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
  return { harness, acknowledgements, options };
}
async function tasks(harness: Harness) {
  return (
    await harness.commit((tx) => tx.scanTasks({}, 100), context)
  ).items.filter((task) => task.kind === "vibestudio.eval-acknowledgement");
}
describe("native Eval acknowledgement ownership", () => {
  it("consumes canonical completion through the original route after losing its start response", async () => {
    const calls: string[] = [];
    const call: EvalCall = async <T>(method: string) => {
      calls.push(method);
      return (
        method === "eval.receipt"
          ? receipt
          : { acknowledged: true, duplicate: false }
      ) as T;
    };
    const f = await fixture(call, new MemoryStorage(), false);
    await consumeEvalReceipt(
      f.harness,
      f.harness,
      receipt.runId,
      call,
      f.acknowledgements,
      context,
    );
    expect(
      (await f.harness.snapshot(ReceiptDoc, receipt.runId, context))?.result,
    ).toEqual(receipt.result);
    expect(calls).toEqual(["eval.receipt", "eval.acknowledge"]);
    expect(await tasks(f.harness)).toHaveLength(1);
  });
  it("atomically consumes once and gives direct/hint races one exact background debt", async () => {
    const calls: unknown[][] = [];
    let f!: Awaited<ReturnType<typeof fixture>>;
    const call: EvalCall = async <T>(method: string, args: unknown[]) => {
      if (method === "eval.receipt") return receipt as T;
      expect(method).toBe("eval.acknowledge");
      expect(
        (await f.harness.snapshot(ReceiptDoc, receipt.runId, context))?.result,
      ).toEqual(receipt.result);
      calls.push(args);
      return { acknowledged: true, duplicate: false } as T;
    };
    f = await fixture(call);
    await retainObservedEvalReceipt(
      f.harness,
      f.harness,
      receipt.runId,
      receipt,
      f.acknowledgements,
      context,
    );
    expect(await tasks(f.harness)).toHaveLength(1);
    await consumeEvalReceipt(
      f.harness,
      f.harness,
      receipt.runId,
      call,
      f.acknowledgements,
      context,
    );
    await retainObservedEvalReceipt(
      f.harness,
      f.harness,
      receipt.runId,
      receipt,
      f.acknowledgements,
      context,
    );
    expect(calls).toEqual([
      [
        {
          runId: receipt.runId,
          receipt: {
            runDigest: receipt.runDigest,
            resultDigest: receipt.resultDigest,
          },
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
    const call: EvalCall = async <T>() => {
      attempts++;
      if (attempts === 1) throw original;
      return { acknowledged: true, duplicate: false } as T;
    };
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
    const f = await fixture(async <T>() => {
      acknowledged++;
      return { acknowledged: true, duplicate: false } as T;
    });
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
      async <T>() => ({ acknowledged: true, duplicate: false }) as T,
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
    class RejectingStorage extends MemoryStorage {
      reject = false;
      readonly original = new StorageRejected(
        "original receipt batch rejected",
      );
      override commit(
        writes: readonly StorageWrite[],
        ctx: Parameters<Storage["commit"]>[1],
      ) {
        if (this.reject) {
          this.reject = false;
          return Promise.reject(this.original);
        }
        return super.commit(writes, ctx);
      }
    }
    const storage = new RejectingStorage();
    const f = await fixture(
      async <T>() => ({ acknowledged: true, duplicate: false }) as T,
      storage,
    );
    storage.reject = true;
    await expect(
      retainObservedEvalReceipt(
        f.harness,
        f.harness,
        receipt.runId,
        receipt,
        f.acknowledgements,
        context,
      ),
    ).rejects.toBe(storage.original);
    expect(await tasks(f.harness)).toHaveLength(0);
    expect(
      (await f.harness.snapshot(ReceiptDoc, receipt.runId, context))?.result,
    ).toBeUndefined();
    await retainObservedEvalReceipt(
      f.harness,
      f.harness,
      receipt.runId,
      receipt,
      f.acknowledgements,
      context,
    );
    expect(await tasks(f.harness)).toHaveLength(1);
  });
});
