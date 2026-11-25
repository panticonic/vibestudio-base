/** TEST ONLY: local scripted gateway, no provider connection and no dataset registration. */
import { it, expect } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { createTestDO } from "@workspace/runtime/worker/test-utils";
import type { AuthenticatedCaller } from "@vibestudio/rpc";
import { natlangRecordsRpcMethods } from "@workspace/natlang-records/contract";
import { createEvalNatlang } from "@workspace/natlang";
import { NatlangRecordsDO } from "../../../workers/natlang-records/NatlangRecordsDO.js";
import { fakeRpc, testNewFunction, toolCallMessage } from "./testSupport.js";
class TestRecords extends NatlangRecordsDO {
  protected override get caller(): AuthenticatedCaller | null {
    return {
      callerId: "test-only-hof",
      callerKind: "worker",
    } as AuthenticatedCaller;
  }
}
const goal =
  "TEST ONLY: retain an adder with delta seven, then apply it to three and return the native scalar ten.";
const files: Record<string, string> = {
  "skills/hof/runUserGoal.nl":
    "---\nargs: {goal: string}\nreturns: number\n---\nRetain a function from make(7), then pass it to consume and return its scalar result.",
  "skills/hof/runUserGoal/make.nl":
    '---\nargs: {delta: number}\nreturns: "(value: number) => number"\n---\nMake an adder which retains delta and returns its result.',
  "skills/hof/runUserGoal/consume.nl":
    '---\nargs: {fn: "(value: number) => number"}\nreturns: number\n---\nApply fn to three and return its result.',
  "skills/hof/natlang.json": JSON.stringify({ serviceBinding: "explicit" }),
};
const memory = {
  readFile: async (path: string) => {
    if (!(path in files)) throw Error("missing test source " + path);
    return files[path];
  },
  readdir: async (path: string) => {
    const names = new Map<string, boolean>();
    for (const file of Object.keys(files))
      if (file.startsWith(path + "/")) {
        const tail = file.slice(path.length + 1);
        names.set(tail.split("/")[0], tail.includes("/"));
      }
    return [...names].map(([name, directory]) => ({
      name,
      isDirectory: () => directory,
    }));
  },
  stat: async (path: string) => ({ isDirectory: () => !(path in files) }),
};
it("captures a genuine escaped higher-order function through the actual Base gateway and records boundary", async () => {
  const { instance: records } = await createTestDO(TestRecords);
  const receiver = records as unknown as Record<
    string,
    (input: unknown) => Promise<unknown>
  >;
  const handlers = Object.fromEntries(
    Object.keys(natlangRecordsRpcMethods).map((method) => [
      method,
      (input: unknown) => receiver[method].call(records, input),
    ]),
  );
  const codes = [
    "const escaped = await make(7); return await consume(escaped);",
    "return nl`Add captured delta to value and return the scalar result.`;",
    "return await fn(3);",
    "return value + delta;",
  ];
  let requested = 0;
  const { rpc } = fakeRpc({
    records: handlers,
    turn: async () => {
      if (requested >= codes.length)
        throw Error("TEST-only script exhausted; no fallback provider exists");
      return toolCallMessage(
        "eval",
        { code: codes[requested++], finish: true },
        { input: 0, output: 0 },
      );
    },
  });
  const emergency: unknown[] = [];
  const runtime = createEvalNatlang({
    retainCaptureEvidence: async (value) => {
      emergency.push(value);
    },
    newFunction: testNewFunction(),
    owner: { kind: "user", objectKey: "test-only-hof" },
    bindings: { rpc, fs: memory },
  });
  try {
    const result = await runtime.runCell(
      async () => {
        const natlang = runtime.ambient.natlang as {
          captureModelTurns(options: { executorModel: string }): void;
          load(
            path: string,
            options: { services: Record<string, object> },
          ): Promise<unknown>;
        };
        natlang.captureModelTurns({ executorModel: "test:executor-small" });
        const entry = (await natlang.load("skills/hof/runUserGoal.nl", {
          services: {},
        })) as (goal: string) => Promise<number>;
        return await entry(goal);
      },
      { runId: "test-only-hof-run", signal: new AbortController().signal },
    );
    expect(result.value).toBe(10);
    expect(requested).toBe(4);
    expect(emergency).toEqual([]);
    const summaries = await records.listCalls({ runId: "test-only-hof-run" });
    const details = await Promise.all(
      summaries.map(async (row) => ({
        callId: row.call_id,
        ...(await records.getCall({ callId: row.call_id })),
      })),
    );
    expect(details).toHaveLength(4);
    const make = details.find(
      (row) => row?.record?.definition.name === "make",
    )!;
    const consume = details.find(
      (row) => row?.record?.definition.name === "consume",
    )!;
    const escaped = details.find(
      (row) => row?.record?.parent_call_id === consume.callId,
    )!;
    expect(make.record?.output).toMatchObject({
      complete: false,
      reason: "nonportable",
    });
    expect(consume.record?.inputs.fn).toMatchObject({
      complete: false,
      reason: "nonportable",
    });
    expect(escaped.record?.parent_call_id).toBe(consume.callId);
    expect(escaped.record?.captures.delta).toMatchObject({ complete: true });
    for (const detail of details)
      expect(detail?.record?.model_turns).toHaveLength(1);
    const destination = process.env.NATLANG_TEST_HOF_ARTIFACT_DIR;
    if (destination) {
      await mkdir(destination, { recursive: true });
      const values: Record<string, string> = {};
      for (const detail of details)
        for (const ref of [
          detail!.record!.output,
          ...Object.values(detail!.record!.inputs),
          ...Object.values(detail!.record!.captures),
        ])
          if (ref?.complete)
            values[ref.hash] = (await records.getValue({ hash: ref.hash }))!;
      await writeFile(
        destination + "/actual-capture.json",
        JSON.stringify(
          {
            testOnly: true,
            noModelInference: true,
            goal,
            files,
            result: result.value,
            details,
            values,
          },
          null,
          2,
        ) + "\n",
      );
    }
  } finally {
    runtime.close();
  }
});
