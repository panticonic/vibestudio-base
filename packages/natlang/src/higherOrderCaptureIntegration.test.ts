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
const pureGoal =
  "TEST ONLY: retain an adder with delta seven, then apply it to three and return the native scalar ten.";
const sourceFiles: Record<string, string> = {
  "skills/hof/runUserGoal.nl":
    "---\nargs: {goal: string}\nreturns: number\n---\nRetain a function from make(7), then pass it to consume and return its scalar result.",
  "skills/hof/runUserGoal/make.nl":
    '---\nargs: {delta: number}\nreturns: "(value: number) => number"\n---\nMake an adder which retains delta and returns its result.',
  "skills/hof/runUserGoal/consume.nl":
    '---\nargs: {fn: "(value: number) => number"}\nreturns: number\n---\nApply fn to three and return its result.',
  "skills/hof/natlang.json": JSON.stringify({ serviceBinding: "explicit" }),
};
function memoryFs(files: Record<string, string>) {
  return {
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
}
it.each([false, true])(
  "captures a genuine escaped higher-order function through the actual Base gateway and records boundary (native effects: %s)",
  async (effectful) => {
    const files = { ...sourceFiles };
    const goal = effectful
      ? "TEST ONLY: retain a native adder, read and independently confirm the native inputs, then add captured delta seven to native value three and return ten."
      : pureGoal;
    let releaseReads!: () => void;
    const bothReads = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const physicalInputs: number[] = [];
    const docs = {
      async search() {
        throw Error("TEST-only catalog permits exact describe reads only");
      },
      async describe(id: string) {
        const value = Number(id);
        if (![3, 4].includes(value))
          throw Error("unissued TEST-only native id");
        physicalInputs.push(value);
        if (physicalInputs.length === 2) releaseReads();
        await bothReads;
        if (value === 3) await Promise.resolve();
        return {
          id,
          surface: "workspace" as const,
          qualifiedName: "test-only-hof/" + id,
          title: String(value),
        };
      },
    };
    if (effectful) {
      files["skills/hof/natlang.json"] = JSON.stringify({
        serviceBinding: "explicit",
        serviceScopes: { docs: ["runUserGoal/make.nl/**"] },
      });
      files["skills/hof/services.d.ts"] =
        "declare module 'natlang:services' {export const docs:{describe(id:string):Promise<{id:string;surface:\"workspace\";qualifiedName:string;title:string}>;search(query:string):Promise<never>};}";
      files["skills/hof/runUserGoal/make/readNative.ts"] =
        "import {docs} from 'natlang:services';export default async function readNative(value:number):Promise<number>{return Number((await docs.describe(String(value))).title);}";
    }
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
      effectful
        ? "return nl`Read and independently confirm the native input through the captured read-only capability, then add captured delta and return the scalar result.`;"
        : "return nl`Add captured delta to value and return the scalar result.`;",
      "return await fn(3);",
      effectful
        ? "const [native,confirmed]=await Promise.all([readNative(value),docs.describe(String(value+1))]);if(Number(confirmed.title)!==value+1)throw Error('native confirmation differs');return native+delta;"
        : "return value + delta;",
    ];
    let requested = 0;
    const { rpc } = fakeRpc({
      records: handlers,
      turn: async () => {
        if (requested >= codes.length)
          throw Error(
            "TEST-only script exhausted; no fallback provider exists",
          );
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
      bindings: { rpc, fs: memoryFs(files) },
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
            services: effectful ? { docs } : {},
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
      if (effectful) {
        expect(physicalInputs.slice().sort()).toEqual([3, 4]);
        expect(make.record?.effects).toEqual([]);
        expect(consume.record?.effects).toEqual([]);
        const effects = escaped.record!.effects;
        expect(effects).toHaveLength(2);
        const pairs = await Promise.all(
          effects.map(async (effect) => ({
            args: JSON.parse(
              (await records.getValue({ hash: effect.args.hash }))!,
            ),
            result: JSON.parse(
              (await records.getValue({ hash: effect.result.hash }))!,
            ),
          })),
        );
        expect(pairs.sort((a, b) => a.args[0] - b.args[0])).toEqual([
          {
            args: ["3"],
            result: {
              id: "3",
              surface: "workspace",
              qualifiedName: "test-only-hof/3",
              title: "3",
            },
          },
          {
            args: ["4"],
            result: {
              id: "4",
              surface: "workspace",
              qualifiedName: "test-only-hof/4",
              title: "4",
            },
          },
        ]);
        const requests = (escaped.events ?? "")
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
          .filter(
            (event) =>
              event.kind === "effect" &&
              event.phase === "requested" &&
              event.service === "docs",
          );
        expect(requests).toHaveLength(2);
        expect(new Set(requests.map((event) => event.seq)).size).toBe(2);
      }
      for (const detail of details)
        expect(detail?.record?.model_turns).toHaveLength(1);
      const artifactRoot = process.env.NATLANG_TEST_HOF_ARTIFACT_DIR;
      const destination = artifactRoot
        ? effectful
          ? artifactRoot + "/effectful"
          : artifactRoot
        : undefined;
      if (destination) {
        await mkdir(destination, { recursive: true });
        const values: Record<string, string> = {};
        for (const detail of details)
          for (const ref of [
            detail!.record!.output,
            ...Object.values(detail!.record!.inputs),
            ...Object.values(detail!.record!.captures),
            ...detail!.record!.effects.flatMap((effect) => [
              effect.args,
              ...(effect.result ? [effect.result] : []),
            ]),
          ])
            if (ref?.complete)
              values[ref.hash] = (await records.getValue({ hash: ref.hash }))!;
        await writeFile(
          destination + "/actual-capture.json",
          JSON.stringify(
            {
              testOnly: true,
              effectful,
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
  },
);
