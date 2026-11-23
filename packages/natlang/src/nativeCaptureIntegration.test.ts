import { it, expect } from "vitest";
import { createTestDO } from "@workspace/runtime/worker/test-utils";
import type { AuthenticatedCaller } from "@vibestudio/rpc";
import { natlangRecordsRpcMethods } from "@workspace/natlang-records/contract";
import { createEvalNatlang } from "@workspace/natlang";
import { NatlangRecordsDO } from "../../../workers/natlang-records/NatlangRecordsDO.js";
import { fakeRpc, testNewFunction, toolCallMessage } from "./testSupport.js";
class NativeRecords extends NatlangRecordsDO {
  protected override get caller(): AuthenticatedCaller | null {
    return { callerId: "integration", callerKind: "worker" } as AuthenticatedCaller;
  }
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...values: unknown[]) => Promise<unknown>;
it("acknowledges real native graph/value checkpoints before paid root and nested calls", async () => {
  const { instance: records } = await createTestDO(NativeRecords);
  const receiver = records as unknown as Record<string, (input: unknown) => Promise<unknown>>;
  const handlers = Object.fromEntries(
    Object.keys(natlangRecordsRpcMethods).map((method) => [
      method,
      (input: unknown) => receiver[method]!.call(records, input),
    ])
  );
  let turns = 0;
  const { rpc } = fakeRpc({
    records: handlers,
    turn: async () => {
      const rows = await records.listCalls({ runId: "native-integration" });
      const running = rows.filter((row) => row.outcome === "running");
      expect(running.length).toBeGreaterThan(0);
      for (const row of running) {
        const detail = await records.getCall({ callId: row.call_id });
        expect(detail?.record).toBeNull();
        expect(detail?.capture_state?.call_id).toBe(row.call_id);
      }
      return ++turns === 1
        ? toolCallMessage("eval", {
            code: "return await nl<string>`Return child.`();",
            finish: true,
          })
        : toolCallMessage("return_result", { status: "success", value: "child" });
    },
  });
  const emergency: unknown[] = [];
  const runtime = createEvalNatlang({
    newFunction: testNewFunction(),
    owner: { kind: "user", objectKey: "native-integration" },
    bindings: { rpc, fs: {} },
    retainCaptureEvidence: async (value) => {
      emergency.push(value);
    },
  });
  const lowered = runtime.lowerCell(
    'natlang.captureModelTurns({executorModel:"test:executor-small"}); return await nl<string>`Call the child.`();',
    { fileName: "native.ts", jsx: false, ambientNames: [], scopeValues: {} }
  );
  expect(lowered.diagnostics).toEqual([]);
  const execute = new AsyncFunction("nl", "natlang", "__natlang", lowered.code);
  const result = await runtime.runCell(
    () => execute(runtime.ambient.nl, runtime.ambient.natlang, runtime.ambient.__natlang),
    { runId: "native-integration", signal: new AbortController().signal }
  );
  expect(result.value).toBe("child");
  expect(turns).toBe(2);
  expect(emergency).toEqual([]);
  const calls = await records.listCalls({ runId: "native-integration" });
  expect(calls).toHaveLength(2);
  for (const call of calls) {
    const detail = await records.getCall({ callId: call.call_id });
    expect(detail?.record?.outcome).toBe("done");
    expect(detail?.record?.model_turns).toHaveLength(1);
    expect(detail?.capture_state).toBeUndefined();
    expect(
      detail?.annotations.some(
        (row) => row.kind === "call-checkpoint" || row.kind === "model-exchange"
      )
    ).toBe(false);
  }
  runtime.close();
});
