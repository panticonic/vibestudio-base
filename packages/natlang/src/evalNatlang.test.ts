import { describe, expect, it } from "vitest";
import { LOCAL_PROVIDER_ID } from "@workspace/model-catalog/catalog";
import { makeTestCatalogEntry } from "@workspace/model-catalog/testing";
import { SERVICE_CATALOG } from "@workspace/natlang-services";
import { createEvalNatlang } from "./evalNatlang.js";
import {
  EXECUTOR_ENTRY,
  fakeRpc,
  testNewFunction,
  toolCallMessage,
  type FakeServices,
} from "./testSupport.js";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...values: unknown[]) => Promise<unknown>;

const owner = {
  kind: "agent" as const,
  objectKey: "agent:test",
  agentRef: "agent-1",
  channelId: "chan-1",
};

/** The text of the last tool result a model turn was shown. */
const lastToolText = (context: any): string =>
  JSON.stringify(
    context.messages.filter((message: any) => message.role === "toolResult").at(-1)?.content ?? ""
  );

function setup(
  services: FakeServices,
  extra: { fs?: unknown; bindings?: Record<string, unknown> } = {}
) {
  const { rpc, calls, gate } = fakeRpc(services);
  const emergency: unknown[] = [];
  const natlang = createEvalNatlang({
    newFunction: testNewFunction(),
    retainCaptureEvidence: async (evidence) => {
      emergency.push(structuredClone(evidence));
    },
    bindings: { rpc, fs: extra.fs ?? {}, ...extra.bindings },
    owner,
  });
  /** Lower, compile and run one cell the way the eval engine does. */
  async function cell(
    source: string,
    scopeValues: Record<string, unknown> = {},
    signal = new AbortController().signal
  ) {
    const lowered = natlang.lowerCell(source, {
      fileName: "cell.ts",
      jsx: false,
      ambientNames: ["fs", "scope"],
      scopeValues,
    });
    expect(lowered.diagnostics).toEqual([]);
    const names = ["nl", "natlang", "__natlang", ...Object.keys(scopeValues)];
    const run = new AsyncFunction(...names, lowered.code);
    gate.open = false;
    return natlang.runCell(
      async () => {
        gate.open = true;
        try {
          return await run(
            natlang.ambient.nl,
            natlang.ambient.natlang,
            natlang.ambient.__natlang,
            ...Object.values(scopeValues)
          );
        } finally {
          gate.open = false;
        }
      },
      { runId: "run-1", signal }
    );
  }
  return { natlang, cell, calls, rpc, gate, emergency };
}

describe("createEvalNatlang", () => {
  it("lowers a cell that uses nl and leaves one that does not alone", () => {
    const { natlang } = setup({});
    const plain = natlang.lowerCell("return 1 + 1;", {
      fileName: "cell.ts",
      jsx: false,
      ambientNames: [],
      scopeValues: {},
    });
    expect(plain).toMatchObject({
      usesNl: false,
      code: "return 1 + 1;",
      diagnostics: [],
    });
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
    expect(lowered.diagnostics[0]).toMatchObject({
      severity: "error",
      line: expect.any(Number),
      column: expect.any(Number),
    });
    expect(lowered.code).toContain("nl`Greet.`");
  });

  it("runs an inline nl call on the executor model through the gateway and records it", async () => {
    const turns: any[] = [];
    const records: any[] = [];
    const { cell } = setup({
      turn: async (input) => {
        turns.push(input);
        return toolCallMessage("return_result", {
          status: "success",
          value: "hello, Ada",
        });
      },
      records: {
        begin: async () => {},
        checkpoint: async () => {},
        appendExchange: async () => {},
        record: (input) => (records.push(input), { recordId: input.record.call_id }),
      },
    });
    const { value, calls } = await cell("return await nl<string>`Greet ${name} warmly.`(name);", {
      name: "Ada",
    });
    expect(value).toBe("hello, Ada");
    // The turn ran on the resolved executor ref, rendered as a Pi context with tools.
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      model: EXECUTOR_ENTRY.ref,
      context: { tools: expect.any(Array) },
    });
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
            return toolCallMessage("eval", {
              code: "return [typeof serverLog, typeof gad, typeof fs, typeof credentials].join();",
            });
          }
          second = input.context;
          return toolCallMessage("return_result", {
            status: "success",
            value: "ok",
          });
        },
      },
      { bindings: { fs: {}, gad: {}, credentials: {}, services: {} } }
    );
    await cell("return await nl<string>`Check what you can reach.`();");
    expect(lastToolText(second)).toContain("undefined,undefined,undefined,undefined");
  });

  it("loads a workspace program that gets exactly its declared services", async () => {
    const serverLogMethods = SERVICE_CATALOG.find((entry) => entry.name === "serverLog")!.methods;
    const serverLog = Object.fromEntries(
      serverLogMethods.map((method) => [method.name, async () => "log"])
    );
    const files: Record<string, string> = {
      "skills/logs/probe.nl":
        "---\nargs: {}\nreturns: string\n---\nReport which services you can use.\n",
      "skills/logs/services.d.ts":
        "declare module 'natlang:services' { export const serverLog: unknown; }",
    };
    const memory = {
      readFile: async (path: string) => files[path]!,
      readdir: async (path: string) =>
        Object.keys(files)
          .filter((file) => file.startsWith(`${path}/`))
          .map((file) => ({
            name: file.slice(path.length + 1),
            isDirectory: () => false,
          })),
      stat: async (path: string) => ({
        isDirectory: () => !path.endsWith(".nl"),
      }),
    };
    let turn = 0;
    let shown: any;
    const { cell } = setup(
      {
        turn: async (input) => {
          turn += 1;
          if (turn === 1) {
            return toolCallMessage("eval", {
              code: "return [typeof serverLog, typeof gad, typeof credentials].join();",
            });
          }
          shown = input.context;
          return toolCallMessage("return_result", {
            status: "success",
            value: "probed",
          });
        },
      },
      {
        fs: memory,
        bindings: { services: { serverLog }, gad: {}, credentials: {} },
      }
    );
    const { value, calls } = await cell(
      "const probe = await natlang.load('skills/logs/probe.nl');\nreturn await probe();"
    );
    expect(value).toBe("probed");
    expect(calls.map((call) => call.name)).toEqual(["probe"]);
    // The program's call saw its declared service and neither of the eval's other bindings.
    expect(lastToolText(shown)).toContain("object,undefined,undefined");
  });

  it("records the program's folder with each call of a loaded program, and none for an inline call", async () => {
    const begun: any[] = [];
    const recorded: any[] = [];
    const reply = async () => toolCallMessage("return_result", { status: "success", value: "ok" });
    const { cell } = setup(
      {
        turn: reply,
        records: {
          begin: (input) => void begun.push(input),
          record: (input) => (recorded.push(input.record), { recordId: input.record.call_id }),
        },
      },
      {
        fs: decisionProgramFiles({
          "skills/logs/probe.nl": "---\nargs: {}\nreturns: string\n---\nSay ok.\n",
        }),
      }
    );
    await cell(
      "const probe = await natlang.load('skills/logs/probe.nl');\nawait probe();\nreturn await nl<string>`Say ok.`();"
    );
    const program = recorded.filter((record) => record.definition.name === "probe");
    const inline = recorded.filter((record) => record.definition.name !== "probe");
    expect(program.map((record) => record.program_root)).toEqual(["skills/logs"]);
    expect(begun.find((row) => row.definition.name === "probe")?.programRoot).toBe("skills/logs");
    expect(inline.map((record) => record.program_root)).toEqual([null]);
  });

  /** The `fs` of an in-memory workspace. */
  const decisionProgramFiles = (files: Record<string, string>) => ({
    readFile: async (path: string) => files[path]!,
    readdir: async (path: string) =>
      Object.keys(files)
        .filter((file) => file.startsWith(`${path}/`))
        .map((file) => ({
          name: file.slice(path.length + 1),
          isDirectory: () => false,
        })),
    stat: async (path: string) => ({
      isDirectory: () => !path.endsWith(".nl"),
    }),
  });

  /** A workspace program with one `readout: decision` function, `skills/triage/judge.nl`. */
  const decisionProgram = () => {
    const files: Record<string, string> = {
      "skills/triage/judge.nl":
        '---\nargs:\n  note: string\nreturns: \'"urgent" | "normal"\'\nreadout: decision\n---\nDecide whether note is urgent.\n',
    };
    return {
      readFile: async (path: string) => files[path]!,
      readdir: async (path: string) =>
        Object.keys(files)
          .filter((file) => file.startsWith(`${path}/`))
          .map((file) => ({
            name: file.slice(path.length + 1),
            isDirectory: () => false,
          })),
      stat: async (path: string) => ({
        isDirectory: () => !path.endsWith(".nl"),
      }),
    };
  };

  it("conditions each scored decision on its actual reasoning sample without a tool-action loop", async () => {
    const scored: any[] = [];
    const reasoning="The observed outage requires urgent attention.";
    let turns = 0;
    const { cell } = setup(
      {
        turn: async input => {
          turns++;
          expect(input.context.tools??[]).toEqual([]);
          return {...toolCallMessage("unused",{}),content:[{type:"thinking",thinking:reasoning}],stopReason:"stop"};
        },
        score: async input => (scored.push(input), [-0.2, -3]),
      },
      { fs: decisionProgram() }
    );
    const { value, calls } = await cell(
      "const judge = await natlang.load('skills/triage/judge.nl');\nreturn await judge('The site is down.');"
    );
    expect(value).toBe("urgent");
    expect(turns).toBeGreaterThan(0);
    expect(scored).toHaveLength(turns);
    expect(scored.every(input=>input.reasoning===reasoning)).toBe(true);
    expect(scored[0]).toMatchObject({
      model: EXECUTOR_ENTRY.ref,
      options: [expect.any(String), expect.any(String)],
    });
    expect(scored[0].tools).toBeUndefined();
    expect(JSON.stringify(scored[0].messages)).toContain("The site is down.");
    expect(calls).toMatchObject([{ name: "judge", outcome: "done" }]);
  });

  it("generates an offered JSON decision when the model cannot score", async () => {
    let turns = 0;
    const { cell } = setup(
      {
        turn: async () => (
          (turns += 1),
          {
            ...toolCallMessage("unused", {}),
            content: [{ type: "text", text: '"normal"' }],
            stopReason: "stop",
          }
        ),
      },
      { fs: decisionProgram() }
    );
    const { value } = await cell(
      "const judge = await natlang.load('skills/triage/judge.nl');\nreturn await judge('Nothing happened.');"
    );
    expect(value).toBe("normal");
    expect(turns).toBeGreaterThan(0);
  });

  it("cancels the pending gateway turn when the run is aborted", async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const { cell } = setup({
      turn: (_input, signal) =>
        new Promise((_, reject) => {
          seen = signal;
          signal?.addEventListener("abort", () => reject(signal.reason ?? new Error("aborted")), {
            once: true,
          });
          queueMicrotask(() => controller.abort(new Error("stop requested")));
        }),
    });
    await expect(
      cell("return await nl<string>`Wait.`();", {}, controller.signal)
    ).rejects.toThrow();
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

  it("serves a recorded call's digest, and its raw record and trace on request", async () => {
    const { natlang } = setup({
      records: {
        getCall: (input) => ({
          record: {
            call_id: input.callId,
            inputs: {},
            outcome: "done",
            detail: '"hi"',
            output: null,
          },
          summary: {
            call_id: input.callId,
            parent_call_id: null,
            definition_name: "greet",
            outcome: "done",
            model_id: "test:executor-small",
          },
          events:
            '{"kind":"model_request"}\n{"kind":"proposal","phase":"generated","turn":1,"text":"","calls":[]}\n' +
            '{"kind":"action","name":"return_result","arguments":{"status":"success","value":"hi"},"outcome":"completed","result_text":"done"}',
          annotations: [],
        }),
        listCalls: () => [],
      },
    });
    const trace = await (natlang.ambient.natlang as any).trace("call-9");
    expect(trace).toMatchObject({
      callId: "call-9",
      name: "greet",
      outcome: "done",
      children: [],
      turns: [
        {
          turn: 1,
          actions: [{ tool: "return_result", outcome: "completed", result: "done" }],
        },
      ],
    });
    expect(trace).not.toHaveProperty("reason");
    const raw = await (natlang.ambient.natlang as any).trace("call-9", {
      raw: true,
    });
    expect(raw).toMatchObject({
      callId: "call-9",
      name: "greet",
      outcome: "done",
    });
    expect(raw.events.map((event: any) => event.kind)).toEqual([
      "model_request",
      "proposal",
      "action",
    ]);
  });

  it("describes nl and natlang in help()", () => {
    const { natlang } = setup({});
    const help = (natlang.ambient.natlang as any).help() as string;
    expect(help).toContain("natlang.load");
    expect(help).toContain("NO services");
    expect(help).toContain("serverLog");
  });
});

describe("serving a local model", () => {
  const LOCAL_ENTRY = makeTestCatalogEntry({
    ref: "local:lfm3-1.7b",
    id: "lfm3-1.7b",
    name: "LFM3 1.7B",
    provider: LOCAL_PROVIDER_ID,
    baseUrl: "http://127.0.0.1:1/v1",
  });

  it("asks a local model for guided generation and the call's seed, and a hosted model for neither", async () => {
    for (const [entry, local] of [
      [LOCAL_ENTRY, true],
      [EXECUTOR_ENTRY, false],
    ] as const) {
      const turns: any[] = [];
      const { cell } = setup({
        roleResolution: { model: entry },
        turn: async (input) => {
          turns.push(input);
          return toolCallMessage("return_result", {
            status: "success",
            value: "ok",
          });
        },
      });
      await cell("return await nl<string>`Say ok.`();");
      expect(turns).toHaveLength(1);
      expect(turns[0].model).toBe(entry.ref);
      if (local) {
        expect(turns[0].options.samplingParams).toMatchObject({
          guidance: true,
          seed: expect.any(Number),
        });
      } else {
        expect(turns[0].options?.samplingParams).toBeUndefined();
      }
    }
  });
});

describe("owned eval model exchange capture", () => {
  it("captures only an explicitly opted-in run with actual invocation and gateway context", async () => {
    const records: any[] = [];
    const { cell } = setup({
      turn: async () =>
        toolCallMessage("return_result", {
          status: "success",
          value: "observed",
        }),
      records: {
        begin: async () => {},
        checkpoint: async () => {},
        appendExchange: async () => {},
        record: (input) => (records.push(input), { recordId: input.record.call_id }),
      },
    });
    await cell("return await nl<string>`Return observed.`();");
    expect(records[0].record.model_turns).toBeUndefined();
    await cell("natlang.captureModelTurns(); return await nl<string>`Return observed.`();");
    const record = records[1].record;
    expect(record.model_turns).toHaveLength(1);
    expect(record.model_turns[0]).toMatchObject({
      schema: "natlang.model-exchange/1",
      kind: "generation",
      request: { invocation_id: record.call_id },
      reply: {
        raw_response: {
          vibestudio: {
            model: EXECUTOR_ENTRY.ref,
            context: expect.any(Object),
            response: expect.any(Object),
          },
        },
      },
    });
    await cell("return await nl<string>`Return observed.`();");
    expect(records[2].record.model_turns).toBeUndefined();
  });
});

describe("owned teacher executor selection", () => {
  it("runs root and nested default executor calls on the actual selected teacher and resets afterward", async () => {
    const teacher = makeTestCatalogEntry({
      ref: "test:teacher",
      id: "teacher",
      name: "teacher",
      provider: "test",
      baseUrl: "http://test.invalid/v1",
    });
    const asked: string[] = [];
    const { cell } = setup({
      models: [teacher],
      turn: async (input) => {
        asked.push(input.model);
        return asked.length === 1
          ? toolCallMessage("eval", {
              code: "return await nl<string>`Return child.`();",
              finish: true,
            })
          : toolCallMessage("return_result", {
              status: "success",
              value: "child",
            });
      },
    });
    const { value } = await cell(
      'natlang.captureModelTurns({executorModel:"test:teacher"}); return await nl<string>`Call the child.`();'
    );
    expect(value).toBe("child");
    expect(asked).toEqual([teacher.ref, teacher.ref]);
    await cell("return await nl<string>`Return child.`();");
    expect(asked.at(-1)).toBe(EXECUTOR_ENTRY.ref);
  });
});

it("detaches a storage-failed cell and captures the next cell with the same runId", async () => {
  let failOnce = true;
  const { cell, emergency } = setup({
    turn: async () =>
      toolCallMessage("return_result", {
        status: "success",
        value: "observed",
      }),
    records: {
      begin: async () => {},
      checkpoint: async () => {},
      appendExchange: async () => {
        if (failOnce) {
          failOnce = false;
          throw new Error("first cell storage unavailable");
        }
      },
      record: (input) => ({ recordId: input.record.call_id }),
    },
  });
  await expect(
    cell("natlang.captureModelTurns(); return await nl<string>`Return observed.`();")
  ).rejects.toThrow("storage unavailable");
  expect(emergency).toMatchObject([
    {
      schema: "natlang.pending-model-exchanges/1",
      runId: "run-1",
      calls: expect.any(Array),
    },
  ]);
  const next = await cell(
    "natlang.captureModelTurns(); return await nl<string>`Return observed.`();"
  );
  expect(next.value).toBe("observed");
});

it("blocks explicit alternate model calls inside a teacher capture before the gateway", async () => {
  const teacher = makeTestCatalogEntry({
    ref: "test:teacher",
    id: "teacher",
    name: "teacher",
    provider: "test",
    baseUrl: "http://test.invalid/v1",
  });
  const requested: string[] = [];
  const { cell } = setup({
    models: [teacher],
    turn: async (input) => {
      requested.push(input.model);
      return toolCallMessage("return_result", { status: "success", value: "wrong model" });
    },
  });
  await expect(
    cell(
      `natlang.captureModelTurns({executorModel:"test:teacher"}); return await nl<string>\`Do the work.\`.on({model:${JSON.stringify(EXECUTOR_ENTRY.ref)}})();`
    )
  ).rejects.toThrow("pinned to test:teacher");
  expect(requested).toEqual([]);
});
