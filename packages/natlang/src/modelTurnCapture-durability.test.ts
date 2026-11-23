import { expect, it, vi } from "vitest";
import { captureExchange } from "./modelTurnCapture.js";
import { RecordsStore } from "./recordsStore.js";

it("does not release a paid model response before durable capture acknowledgement", async () => {
  let acknowledge!: () => void;
  const persisted = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  let delivered = false;
  const pending = captureExchange(
    "generation",
    { invocation_id: "call" },
    async () => ({ answer: "paid" }),
    () => persisted
  ).then((value) => {
    delivered = true;
    return value;
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(delivered).toBe(false);
  acknowledge();
  expect(await pending).toEqual({ answer: "paid" });
});
it("stops capture-enabled execution if persistence fails", async () => {
  await expect(
    captureExchange(
      "generation",
      { invocation_id: "call" },
      async () => ({ answer: "paid" }),
      async () => {
        throw new Error("disk unavailable");
      }
    )
  ).rejects.toThrow("disk unavailable");
});
it("serializes concurrent captures with distinct durable ordinals and retains exact replies", async () => {
  const appended: any[] = [];
  const store = new RecordsStore(
    {
      appendExchange: async (input: any) => {
        appended.push(structuredClone(input));
      },
    } as any,
    { kind: "user", objectKey: "owner" },
    () => {}
  );
  store.attach({ runId: "run", calls: [], captureModelTurns: true });
  const first = {
    schema: "natlang.model-exchange/1" as const,
    kind: "generation" as const,
    request: { invocation_id: "call" },
    reply: { answer: "first" },
  };
  const second = { ...first, reply: { answer: "second" } };
  await Promise.all([store.captureModelExchange(first), store.captureModelExchange(second)]);
  expect(appended.map((row) => row.ordinal)).toEqual([0, 1]);
  expect(appended.map((row) => row.exchange.reply.answer)).toEqual(["first", "second"]);
});
it("keeps durable capture failures visible to its caller", async () => {
  const report = vi.fn();
  const store = new RecordsStore(
    {
      appendExchange: async () => {
        throw new Error("unavailable");
      },
    } as any,
    { kind: "user", objectKey: "owner" },
    report
  );
  store.attach({ runId: "run", calls: [], captureModelTurns: true });
  await expect(
    store.captureModelExchange({
      schema: "natlang.model-exchange/1",
      kind: "generation",
      request: { invocation_id: "call" },
      reply: "paid",
    })
  ).rejects.toThrow("unavailable");
  expect(report).toHaveBeenCalledWith(expect.stringContaining("capture failed"));
});

it("refuses an uncapturable invocation before spending inference", async () => {
  const store = new RecordsStore({} as any, { kind: "user", objectKey: "owner" }, () => {});
  store.attach({ runId: "run", calls: [], captureModelTurns: true });
  await expect(store.prepareModelExchange({ invocation_id: "not-begun" })).rejects.toThrow(
    "active call record"
  );
});
