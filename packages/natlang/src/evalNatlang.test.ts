import { describe, expect, it } from "vitest";
import { SERVICE_CATALOG } from "@workspace/natlang-services";
import { createEvalNatlang } from "./evalNatlang.js";
import { EXECUTOR_ENTRY, fakeRpc, testNewFunction, toolCallMessage, type FakeServices } from "./testSupport.js";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...values: unknown[]) => Promise<unknown>;

const owner = { kind: "agent" as const, objectKey: "agent:test", agentRef: "agent-1", channelId: "chan-1" };

/** The text of the last tool result a model turn was shown. */
const lastToolText = (context: any): string =>
  JSON.stringify(context.messages.filter((message: any) => message.role === "toolResult").at(-1)?.content ?? "");

function setup(services: FakeServices, extra: { fs?: unknown; bindings?: Record<string, unknown> } = {}) {
  const { rpc, calls } = fakeRpc(services);
  const natlang = createEvalNatlang({
    newFunction: testNewFunction(),
    bindings: { rpc, fs: extra.fs ?? {}, ...extra.bindings },
    owner,
  });
  /** Lower, compile and run one cell the way the eval engine does. */
  async function cell(source: string, scopeValues: Record<string, unknown> = {}, signal = new AbortController().signal) {
    const lowered = natlang.lowerCell(source, { fileName: "cell.ts", jsx: false, ambientNames: ["fs", "scope"], scopeValues });
    expect(lowered.diagnostics).toEqual([]);
    const names = ["nl", "natlang", "__natlang", ...Object.keys(scopeValues)];
    const run = new AsyncFunction(...names, lowered.code);
    return natlang.runCell(
      () => run(natlang.ambient.nl, natlang.ambient.natlang, natlang.ambient.__natlang, ...Object.values(scopeValues)),
      { runId: "run-1", signal }
    );
  }
  return { natlang, cell, calls, rpc };
}

describe("createEvalNatlang", () => {
  it("lowers a cell that uses nl and leaves one that does not alone", () => {
    const { natlang } = setup({});
    const plain = natlang.lowerCell("return 1 + 1;", { fileName: "cell.ts", jsx: false, ambientNames: [], scopeValues: {} });
    expect(plain).toMatchObject({ usesNl: false, code: "return 1 + 1;", diagnostics: [] });
    const lowered = natlang.lowerCell("return await nl<string>`Greet ${name}.`(name);", {
      fileName: "cell.ts",
      jsx: false,
      ambientNames: ["fs"],
      scopeValues: {},
    });
    expect(lowered.usesNl).toBe(true);
    expect(lowered.code).toContain("nl.__inline(");
  });

  it("reports a cell natlang cannot plan as diagnostics with cell positions", () => {
    const { natlang } = setup({});
    const lowered = natlang.lowerCell("const r = await nl`Greet.`(;\nreturn r;", {
      fileName: "cell.ts",
      jsx: false,
      ambientNames: [],
      scopeValues: {},
    });
    expect(lowered.diagnostics.length).toBeGreaterThan(0);
    expect(lowered.diagnostics[0]).toMatchObject({ severity: "error", line: expect.any(Number), column: expect.any(Number) });
    expect(lowered.code).toContain("nl`Greet.`");
  });

  it("runs an inline nl call on the executor model through the gateway and records it", async () => {
    const turns: any[] = [];
    const records: any[] = [];
    const { cell } = setup({
      turn: async (input) => {
        turns.push(input);
        return toolCallMessage("return_result", { status: "success", value: "hello, Ada" });
      },
      records: { record: (input) => (records.push(input), { recordId: input.record.call_id }) },
    });
    const { value, calls } = await cell("return await nl<string>`Greet ${name} warmly.`(name);", { name: "Ada" });
    expect(value).toBe("hello, Ada");
    // The turn ran on the resolved executor ref, rendered as a Pi context with tools.
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ model: EXECUTOR_ENTRY.ref, context: { tools: expect.any(Array) } });
    expect(turns[0].context.tools.map((tool: any) => tool.name)).toContain("return_result");
    // The cell reports its root call, with the record the records service stored.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      outcome: "done",
      model: EXECUTOR_ENTRY.ref,
      turns: 1,
      promptTokens: 11,
      completionTokens: 7,
      recordId: calls[0]!.callId,
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ owner, runId: "run-1" });
  });

  it("gives an inline call no services and none of the cell's bindings", async () => {
    let second: any;
    let turn = 0;
    const { cell } = setup(
      {
        turn: async (input) => {
          turn += 1;
          if (turn === 1) {
            return toolCallMessage("eval", { code: "return [typeof serverLog, typeof gad, typeof fs, typeof credentials].join();" });
          }
          second = input.context;
          return toolCallMessage("return_result", { status: "success", value: "ok" });
        },
      },
      { bindings: { fs: {}, gad: {}, credentials: {}, services: {} } }
    );
    await cell("return await nl<string>`Check what you can reach.`();");
    expect(lastToolText(second)).toContain("undefined,undefined,undefined,undefined");
  });

  it("loads a workspace program that gets exactly its declared services", async () => {
    const serverLogMethods = SERVICE_CATALOG.find((entry) => entry.name === "serverLog")!.methods;
    const serverLog = Object.fromEntries(serverLogMethods.map((method) => [method.name, async () => "log"]));
    const files: Record<string, string> = {
      "skills/logs/probe.nl": "---\nargs: {}\nreturns: string\n---\nReport which services you can use.\n",
      "skills/logs/services.d.ts": "declare module 'natlang:services' { export const serverLog: unknown; }",
    };
    const memory = {
      readFile: async (path: string) => files[path]!,
      readdir: async (path: string) =>
        Object.keys(files)
          .filter((file) => file.startsWith(`${path}/`))
          .map((file) => ({ name: file.slice(path.length + 1), isDirectory: () => false })),
      stat: async (path: string) => ({ isDirectory: () => !path.endsWith(".nl") }),
    };
    let turn = 0;
    let shown: any;
    const { cell } = setup(
      {
        turn: async (input) => {
          turn += 1;
          if (turn === 1) {
            return toolCallMessage("eval", { code: "return [typeof serverLog, typeof gad, typeof credentials].join();" });
          }
          shown = input.context;
          return toolCallMessage("return_result", { status: "success", value: "probed" });
        },
      },
      { fs: memory, bindings: { services: { serverLog }, gad: {}, credentials: {} } }
    );
    const { value, calls } = await cell("const probe = await natlang.load('skills/logs/probe.nl');\nreturn await probe();");
    expect(value).toBe("probed");
    expect(calls.map((call) => call.name)).toEqual(["probe"]);
    // The program's call saw its declared service and neither of the eval's other bindings.
    expect(lastToolText(shown)).toContain("object,undefined,undefined");
  });

  it("cancels the pending gateway turn when the run is aborted", async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const { cell } = setup({
      turn: (_input, signal) =>
        new Promise((_, reject) => {
          seen = signal;
          signal?.addEventListener("abort", () => reject(signal.reason ?? new Error("aborted")), { once: true });
          queueMicrotask(() => controller.abort(new Error("stop requested")));
        }),
    });
    await expect(cell("return await nl<string>`Wait.`();", {}, controller.signal)).rejects.toThrow();
    expect(seen?.aborted).toBe(true);
  });

  it("publishes live events only while the records service reports a subscriber", async () => {
    const published: any[] = [];
    const { cell } = setup({
      turn: async () => toolCallMessage("return_result", { status: "success", value: "x" }),
      records: {
        liveInterest: () => ({ subscribed: true }),
        publishLive: (input) => (published.push(input), { delivered: 1 }),
      },
    });
    await cell("return await nl<string>`Say x.`();");
    const types = published.flatMap((batch) => batch.events.map((event: any) => event.type));
    expect(types[0]).toBe("call_start");
    expect(types).toContain("call_end");
    expect(published[0]).toMatchObject({ owner, runId: "run-1" });
  });

  it("serves the trace of a recorded call", async () => {
    const { natlang } = setup({
      records: {
        getCall: (input) => ({
          record: { call_id: input.callId },
          summary: { definition_name: "greet", outcome: "done", model_id: "test:executor-small" },
          events: '{"kind":"model_request"}\n{"kind":"action"}',
          annotations: [],
        }),
      },
    });
    const trace = await (natlang.ambient.natlang as any).trace("call-9");
    expect(trace).toMatchObject({ callId: "call-9", name: "greet", outcome: "done" });
    expect(trace.events).toEqual([{ kind: "model_request" }, { kind: "action" }]);
  });

  it("describes nl and natlang in help()", () => {
    const { natlang } = setup({});
    const help = (natlang.ambient.natlang as any).help() as string;
    expect(help).toContain("natlang.load");
    expect(help).toContain("NO services");
    expect(help).toContain("serverLog");
  });
});
