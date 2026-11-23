import { it, expect } from "vitest";
import { RecordsStore } from "./recordsStore.js";
import { gatewayDriver } from "./driver.js";
import { EXECUTOR_ENTRY, toolCallMessage } from "./testSupport.js";
const owner = { kind: "user" as const, objectKey: "owner" };
const row = (callId: string) => ({
  callId,
  parentCallId: null,
  parentActionIndex: null,
  taskId: "task",
  programId: null,
  programRoot: null,
  definition: {
    id: "d",
    name: "work",
    source: "work.nl",
    key: "k",
    interface: "i",
    site: "named",
  },
  modelId: "teacher:luna",
  startedAt: "2026-11-23T00:00:00.000Z",
  auditOf: null,
});
const exchange = (id = "call") => ({
  schema: "natlang.model-exchange/1" as const,
  kind: "generation" as const,
  request: { invocation_id: id },
  reply: "irreplaceable paid bytes",
});
it("binds late replies after detach and rejects old active IDs for a new attachment", async () => {
  const appended: unknown[] = [];
  const store = new RecordsStore(
    {
      begin: async () => {},
      appendExchange: async (input: unknown) => {
        appended.push(input);
      },
    } as never,
    owner,
    () => {},
    async () => {}
  );
  store.attach({ runId: "same", calls: [], captureModelTurns: true });
  store.begin(row("old"));
  const binding = await store.prepareModelExchange({ invocation_id: "old" });
  store.attach(null);
  store.attach({ runId: "same", calls: [], captureModelTurns: true });
  await binding.record(exchange("old"));
  binding.finish();
  expect(appended).toHaveLength(1);
  await expect(store.prepareModelExchange({ invocation_id: "old" })).rejects.toThrow("active call");
  await expect(store.flush()).resolves.toBeUndefined();
});
it("isolates delayed old storage failure from the next attachment with the same run ID", async () => {
  let fail!: (error: Error) => void;
  const pending = new Promise<void>((_, reject) => {
    fail = reject;
  });
  const emergency: unknown[] = [];
  const store = new RecordsStore(
    { appendExchange: async () => pending } as never,
    owner,
    () => {},
    async (e) => {
      emergency.push(e);
    }
  );
  store.attach({ runId: "same", calls: [], captureModelTurns: true });
  const captured = store.captureModelExchange(exchange("old"));
  const rejected = expect(captured).rejects.toThrow("old storage fault");
  store.attach({ runId: "same", calls: [], captureModelTurns: true });
  fail(new Error("old storage fault"));
  await rejected;
  await expect(store.flush()).resolves.toBeUndefined();
  expect(emergency[0]).toMatchObject({
    runId: "same",
    calls: [{ callId: "old", model_turns: [exchange("old")], acknowledgedPrefix: 0 }],
  });
});
it("retains unacknowledged replies after final persistence failure and detach", async () => {
  const emergency: any[] = [];
  const store = new RecordsStore(
    {
      appendExchange: async () => {
        throw Error("disk");
      },
      record: async () => {
        throw Error("disk");
      },
    } as never,
    owner,
    () => {},
    async (e) => {
      emergency.push(structuredClone(e));
    }
  );
  store.attach({ runId: "run", calls: [], captureModelTurns: true });
  await expect(store.captureModelExchange(exchange())).rejects.toThrow("disk");
  store.record(
    {
      call_id: "call",
      program_root: null,
      task_id: "task",
      parent_call_id: "parent",
    } as never,
    new Map()
  );
  await expect(store.flush()).rejects.toThrow("disk");
  store.attach(null);
  expect(emergency.at(-1).calls[0]).toMatchObject({
    model_turns: [exchange()],
    acknowledgedPrefix: 0,
    pending: { kind: "record" },
  });
  expect(store.pendingCaptureEvidence()).toMatchObject([
    { calls: [{ model_turns: [exchange()] }] },
  ]);
});
it("joins in-flight capture ownership before releasing an eval run", async () => {
  const store = new RecordsStore(
    { begin: async () => {}, appendExchange: async () => {} } as never,
    owner,
    () => {},
    async () => {}
  );
  const run = { runId: "run", calls: [], captureModelTurns: true };
  store.attach(run);
  store.begin(row("call"));
  const binding = await store.prepareModelExchange({ invocation_id: "call" });
  let settled = false;
  const settling = store.settleCaptures(run).then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  await binding.record(exchange());
  binding.finish();
  await settling;
  expect(settled).toBe(true);
});
it("retains the raw gateway reply when normalization rejects a paid response", async () => {
  const raw = {
    ...toolCallMessage("return_result", {}),
    stopReason: "error",
    errorMessage: "provider failed after partial paid output",
  };
  const captures: any[] = [];
  let finished = false;
  const driver = gatewayDriver({
    gateway: {
      turn: async () => ({
        message: raw,
        model: EXECUTOR_ENTRY.ref,
        attribution: { native: true },
      }),
    } as never,
    resolver: { resolve: async () => EXECUTOR_ENTRY },
    model: EXECUTOR_ENTRY.ref,
    turnPrefix: "capture",
    captureModelTurns: () => true,
    prepareCapture: async () => ({
      record: async (e) => {
        captures.push(e);
      },
      finish: () => {
        finished = true;
      },
    }),
  });
  await expect(
    driver({
      invocation_id: "call",
      messages: [{ role: "user", content: "Work" }],
      tools: [],
      seed: null,
      max_tokens: null,
    } as never)
  ).rejects.toThrow("partial paid output");
  expect(captures[0]).toMatchObject({
    error: { message: raw.errorMessage },
    provider: { result: { message: raw } },
  });
  expect(captures[0].reply).toBeUndefined();
  expect(finished).toBe(true);
});
it("refuses absent capture ownership before inference", async () => {
  let turns = 0;
  const driver = gatewayDriver({
    gateway: {
      turn: async () => {
        turns++;
        return {};
      },
    } as never,
    resolver: { resolve: async () => EXECUTOR_ENTRY },
    model: EXECUTOR_ENTRY.ref,
    turnPrefix: "missing",
    captureModelTurns: () => true,
  });
  await expect(driver({ invocation_id: "call" } as never)).rejects.toThrow("durable capture owner");
  expect(turns).toBe(0);
});
it("enforces the pinned teacher before generation and scoring on an explicit other model", async () => {
  let turns = 0,
    scores = 0;
  const captures: unknown[] = [];
  const driver = gatewayDriver({
    gateway: {
      turn: async () => {
        turns++;
        return {};
      },
      score: async () => {
        scores++;
        return {};
      },
    } as never,
    resolver: { resolve: async () => EXECUTOR_ENTRY },
    model: "strong",
    turnPrefix: "fenced",
    captureModelTurns: () => true,
    prepareCapture: async () => ({
      executorModel: "teacher:luna",
      record: async (e) => {
        captures.push(e);
      },
      finish: () => {},
    }),
  });
  await expect(driver({ invocation_id: "call" } as never)).rejects.toThrow(
    "pinned to teacher:luna"
  );
  await expect(
    (driver as any).decide({
      invocation_id: "call",
      messages: [],
      options: ["yes"],
    })
  ).rejects.toThrow("pinned to teacher:luna");
  expect(turns).toBe(0);
  expect(scores).toBe(0);
  expect(captures).toHaveLength(2);
});
it("does not let a second capture opt-in clear or replace the pinned teacher", () => {
  const store = new RecordsStore({} as never, owner, () => {});
  store.attach({ runId: "run", calls: [] });
  store.enableModelTurnCapture({ executorModel: "teacher:luna" });
  store.enableModelTurnCapture();
  expect(store.capturedExecutorModel).toBe("teacher:luna");
  expect(() => store.enableModelTurnCapture({ executorModel: "teacher:sol" })).toThrow(
    "already pinned"
  );
  expect(store.capturedExecutorModel).toBe("teacher:luna");
});
it("owns blocked preflight and rejects a detached owner before inference", async () => {
  let acknowledge!: () => void;
  const begun = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  const store = new RecordsStore(
    { begin: async () => begun } as never,
    owner,
    () => {},
    async () => {}
  );
  store.attach({ runId: "run", calls: [], captureModelTurns: true });
  store.begin(row("call"));
  const preparing = store.prepareModelExchange({ invocation_id: "call" });
  const rejected = expect(preparing).rejects.toThrow("attachment ended");
  store.attach(null);
  acknowledge();
  await rejected;
});
