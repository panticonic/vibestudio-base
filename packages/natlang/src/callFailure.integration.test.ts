import { describe, expect, it } from "vitest";
import { executeSandbox } from "@workspace/eval";
import { formatEvalResult } from "@workspace/harness/tools/eval";
import { makeTestCatalogEntry } from "@workspace/model-catalog/testing";
import { MODEL_ROLE_CALL_BUDGETS } from "@workspace/model-catalog/modelRoles";
import { createEvalNatlang } from "./evalNatlang.js";
import { EXECUTOR_ENTRY, fakeRpc, testNewFunction, toolCallMessage, type FakeServices } from "./testSupport.js";

/**
 * What an agent sees when a natlang call goes wrong, end to end: the provider lowers the cell, the real eval engine
 * runs it inside the provider's `runCell`, and the harness's own `formatEvalResult` renders the result the agent
 * reads. The model is scripted behind the fake gateway; the records service is an in-memory fake that keeps what
 * the provider writes. Nothing here hands the formatter a made-up failure.
 */

/** A Pi assistant message with text only (no tool call). */
function textMessage(text: string) {
  return { ...toolCallMessage("unused", {}), content: [{ type: "text", text }], stopReason: "stop" };
}

/** The natlang records service, in memory: records, their value blobs, events and annotations. */
function memoryRecords() {
  const calls = new Map<string, { record: any; events: string | null; annotations: any[] }>();
  const blobs = new Map<string, string>();
  const summary = (record: any) => ({
    call_id: record.call_id,
    parent_call_id: record.parent_call_id,
    definition_id: record.definition.id,
    definition_name: record.definition.name,
    model_id: record.executor.model_id,
    outcome: record.outcome,
    started_at: record.started_at,
    wall_ms: record.cost.wall_ms,
    tokens_in: record.cost.tokens_in,
    tokens_out: record.cost.tokens_out,
    run_id: null,
  });
  return {
    calls,
    handlers: {
      record: (input: any) => {
        for (const [hash, text] of Object.entries(input.blobs ?? {})) blobs.set(hash, text as string);
        calls.set(input.record.call_id, { record: input.record, events: input.events ?? null, annotations: [] });
        return { recordId: input.record.call_id };
      },
      annotate: (input: any) => {
        calls.get(input.callId)?.annotations.push({ kind: input.kind, value: input.value, source: input.source ?? null, created_at: "" });
      },
      getCall: (input: any) => {
        const call = calls.get(input.callId);
        return call ? { record: call.record, summary: summary(call.record), events: call.events, annotations: call.annotations } : null;
      },
      listCalls: (filter: any) =>
        [...calls.values()]
          .map((call) => call.record)
          .filter((record) => filter.parentCallId === undefined || record.parent_call_id === filter.parentCallId)
          .map(summary),
      getValue: (input: any) => blobs.get(input.hash) ?? null,
    },
  };
}

/** A workspace `fs` over a map of files, enough for `natlang.load`. */
function files(map: Record<string, string>) {
  return {
    readFile: async (path: string) => {
      if (!(path in map)) throw new Error(`ENOENT: ${path}`);
      return map[path]!;
    },
    readdir: async (path: string) =>
      Object.keys(map)
        .filter((file) => file.startsWith(`${path}/`))
        .map((file) => ({ name: file.slice(path.length + 1), isDirectory: () => false })),
    stat: async (path: string) => ({ isDirectory: () => !/\.(nl|ts)$/.test(path) }),
  };
}

function harness(services: FakeServices, fs: unknown = {}) {
  const records = memoryRecords();
  const { rpc, gate } = fakeRpc({ ...services, records: { ...records.handlers, ...services.records } });
  const newFunction = testNewFunction();
  const natlang = createEvalNatlang({
    newFunction,
    bindings: { rpc, fs },
    owner: { kind: "agent", objectKey: "agent:test", agentRef: "agent-1", channelId: "chan-1" },
  });
  /** One cell, as the EvalDO runs it; `seen` is the text the agent reads. */
  async function cell(code: string, signal = new AbortController().signal) {
    const lowered = natlang.lowerCell(code, { fileName: "cell.ts", jsx: false, ambientNames: ["scope", "rpc", "fs"], scopeValues: {} });
    expect(lowered.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    gate.open = false;
    const { value, calls } = await natlang.runCell(
      async () => {
        gate.open = true;
        try {
          return await executeSandbox(lowered.code, {
            syntax: "typescript",
            bindings: { ...natlang.ambient, scope: {}, rpc, fs },
            moduleMap: {},
            require: (id: string) => {
              throw new Error(`Module not found: ${id}`);
            },
            compileFunction: (argNames, body) => newFunction(body, "eval", ...argNames),
            confinement: "private-global",
            signal,
          });
        } finally {
          gate.open = false;
        }
      },
      { runId: "run-1", signal }
    );
    const result = {
      success: value.success,
      console: value.consoleOutput ?? "",
      ...(value.success ? { returnValue: value.returnValue } : { error: value.error, failureKind: value.failureKind, failureCode: value.failureCode }),
      ...(calls.length ? { natlang: { calls } } : {}),
    } as Parameters<typeof formatEvalResult>[0];
    const formatted = await formatEvalResult(result);
    const seen = (formatted.output?.[0] as { text: string }).text;
    return { value, calls, result, seen, errorData: (value.error as any)?.errorData };
  }
  return { cell, records };
}

describe("a failed natlang call, as the agent sees it", () => {
  it("a model that only replies in prose ends after a bounded number of turns, as no-action", async () => {
    let turns = 0;
    const { cell } = harness({ turn: async () => (turns++, textMessage("The ticket seems urgent.")) });
    const { seen, errorData, value } = await cell("return await nl<'urgent' | 'normal'>`Decide whether the ticket is urgent.`();");
    expect(turns).toBe(4);
    expect(value).toMatchObject({ success: false, failureKind: "user-code", failureCode: "natlang_call_failed" });
    expect(errorData).toMatchObject({ protocol: "natlang-call-failure/1", reason: "no-action", turns: 4, model: EXECUTOR_ENTRY.ref });
    expect(seen).toContain(
      `[eval] Error: natlang nl@cell.ts:1: quiesced: model_incomplete: no_action (4 replies in a row called no tool and returned no result; the last one said: "The ticket seems urgent.") (record ${errorData.callId})`
    );
    expect(seen).toContain("[natlang] nl@cell.ts:1 failed: no-action. Next: ");
  });

  it("an eval loop that never returns stops at the executor's turn budget", async () => {
    let turns = 0;
    const { cell } = harness({ turn: async () => (turns++, toolCallMessage("eval", { code: `return ${turns};` })) });
    const { errorData } = await cell("return await nl<string>`Count.`();");
    expect(turns).toBe(MODEL_ROLE_CALL_BUDGETS.executor.maxTurns);
    expect(errorData).toMatchObject({ reason: "budget-exhausted", detail: "episode turn, token, or wall-clock budget exhausted" });
  });

  it("blocked: the error line, the reason with its next step and the trace handle, each once and without a stack", async () => {
    const { cell } = harness({
      turn: async () => toolCallMessage("return_result", { status: "blocked", reason: "no ticket text was given" }),
    });
    const { seen, errorData } = await cell("return await nl<string>`Summarize the ticket.`();");
    const id = errorData.callId as string;
    expect(seen.split("\n").slice(0, 3)).toEqual([
      `[eval] Error: natlang nl@cell.ts:1: quiesced: blocked: no ticket text was given (record ${id})`,
      "[natlang] nl@cell.ts:1 failed: blocked. Next: The model says the inputs do not support an answer: check what you passed (the trace's inputs) and pass the missing evidence as an argument.",
      `[natlang] Trace: await natlang.trace(${JSON.stringify(id)})`,
    ]);
    expect(seen).toContain(`- nl@cell.ts:1: blocked [1 turn, 11+7 tokens, `);
    expect(seen.match(/no ticket text was given/g)).toHaveLength(1);
    expect(seen).not.toContain("Error stack");
    expect(seen).not.toContain("natlang-workerd.js");
  });

  it("a value of the wrong type, again and again, is type-mismatch", async () => {
    const { errorData } = await harness({
      turn: async () => toolCallMessage("return_result", { status: "success", value: "maybe" }),
    }).cell("const v: 'urgent' | 'normal' = await nl`Decide whether ${'x'} is urgent.`('x');\nreturn v;");
    expect(errorData).toMatchObject({ reason: "type-mismatch", outcome: "quiesced" });
    expect(errorData.detail).toMatch(/^model_incomplete: repeated_failed_action .*type-mismatch/s);
  });

  it("no executor model: the role's reason reaches the agent as executor-unavailable", async () => {
    const reason = "No local executor model is ready and no hosted model is usable. Connect a provider or install the local executor model.";
    const { seen, errorData } = await harness({ roleResolution: { model: null, reason } }).cell("return await nl<string>`Say hi.`();");
    expect(errorData).toMatchObject({ reason: "executor-unavailable", outcome: "failed", detail: reason });
    expect(seen).toContain(`[eval] Error: natlang nl@cell.ts:1: failed: ${reason} (record `);
    expect(seen).toContain("[natlang] nl@cell.ts:1 failed: executor-unavailable. Next: No model fills the executor role: see the local-models skill");
  });

  it("a gateway refusal is model-refused, with its cause", async () => {
    const { seen, errorData } = await harness({
      turn: async () => {
        throw Object.assign(new Error("access denied: caller lacks model.use"), { code: "ACCESS_DENIED", errorKind: "access" });
      },
    }).cell("return await nl<string>`Say hi.`();");
    expect(errorData).toMatchObject({
      reason: "model-refused",
      cause: { message: "access denied: caller lacks model.use", code: "ACCESS_DENIED", errorKind: "access" },
    });
    expect(seen).toContain("[eval] Error: natlang nl@cell.ts:1: failed: access denied: caller lacks model.use (record ");
    expect(seen).toContain("[natlang] Cause: access denied: caller lacks model.use (ACCESS_DENIED)");
  });

  it("cancelling the run ends the cell as cancelled, and lists the call as cancelled", async () => {
    const controller = new AbortController();
    const { value, calls, seen } = await harness({
      turn: (_input, signal) =>
        new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
          queueMicrotask(() => controller.abort(new Error("stop requested by user")));
        }),
    }).cell("return await nl<string>`Wait.`();", controller.signal);
    // The run's cancellation is what ends the cell (the engine stops waiting on the cell at once); the call it stopped
    // is recorded and listed as cancelled.
    expect(value).toMatchObject({ success: false, failureKind: "cancelled", failureCode: "eval_cancelled" });
    expect(calls).toMatchObject([{ outcome: "failed", reason: "cancelled" }]);
    expect(seen).toContain("- nl@cell.ts:1: cancelled (stop requested by user) [");
  });
});

describe("recovering from a failed call", () => {
  it("in the cell: the error carries the record, its partial work, and natlang.trace reads a digest", async () => {
    let turn = 0;
    const { cell } = harness({
      turn: async () => {
        turn += 1;
        if (turn === 1) return toolCallMessage("eval", { code: "const found = ['a', 'b'];\nreturn found.length;" });
        if (turn === 2) return toolCallMessage("eval", { code: "return missingThing.read();" });
        return toolCallMessage("return_result", { status: "failed", reason: "the input has no thing to read" });
      },
    });
    const { value } = await cell(
      "try { return await nl<string>`Read the thing.`(); }\n" +
        "catch (e: any) {\n" +
        "  if (e.name !== 'NatlangCallError') throw e;\n" +
        "  const t = await natlang.trace(e.callId);\n" +
        "  const raw = await natlang.trace(e.callId, { raw: true });\n" +
        "  return { reason: e.reason, detail: e.detail, trace: e.trace, partial: e.partial, digest: t, rawKinds: raw.events.length };\n" +
        "}"
    );
    const returned = value.returnValue as any;
    expect(returned).toMatchObject({
      reason: "failed",
      detail: "error: the input has no thing to read",
      partial: { scope: { found: '["a","b"]' } },
    });
    expect(returned.trace).toMatch(/^await natlang\.trace\("run-1-.*\/1"\)$/);
    expect(returned.rawKinds).toBeGreaterThan(10);
    const digest = returned.digest;
    expect(digest).toMatchObject({ name: "nl@cell.ts:1", outcome: "quiesced", reason: "failed", model: EXECUTOR_ENTRY.ref, children: [] });
    expect(digest.turns.map((t: any) => t.actions.map((a: any) => `${a.tool}:${a.outcome}`))).toEqual([
      ["eval:ok"],
      ["eval:error"],
      ["return_result:blocked"],
    ]);
    expect(digest.turns[1].actions[0]).toMatchObject({
      code: "return missingThing.read();",
      result: expect.stringContaining("Cannot read properties of undefined (reading 'read')"),
    });
    expect(digest.lastScope).toEqual({ scope: { found: '["a","b"]' } });
    expect(JSON.stringify(digest).length).toBeLessThan(4000);
  });

  it("a nested failure names the child in the digest and in natlang.calls", async () => {
    const program = {
      "skills/n/outer.nl": "---\nargs:\n  thing: string\nreturns: string\n---\nCall pick with thing and return its result.\n",
      "skills/n/outer/pick.nl": "---\nargs:\n  thing: string\nreturns: string\n---\nPick a color for thing.\n",
    };
    const { cell } = harness(
      {
        turn: async (input) =>
          JSON.stringify(input.context.messages).includes("Pick a color")
            ? toolCallMessage("return_result", { status: "failed", reason: "the child could not decide" })
            : toolCallMessage("eval", { code: "return await pick(thing);" }),
      },
      files(program)
    );
    const { errorData } = await cell("const outer = await natlang.load('skills/n/outer.nl');\nreturn await outer('sky');");
    expect(errorData).toMatchObject({ name: "outer", reason: "repeated-failed-action" });
    const { value } = await cell(
      `const t = await natlang.trace(${JSON.stringify(errorData.callId)});\n` +
        `const listed = await natlang.calls({ parentCallId: ${JSON.stringify(errorData.callId)} });\n` +
        "const child = await natlang.trace(t.children[0].callId);\n" +
        "return { children: t.children, listed: listed.map((c: any) => c.name), child: { reason: child.reason, inputs: child.inputs } };"
    );
    const returned = value.returnValue as any;
    expect(returned.children[0]).toMatchObject({ name: "pick", outcome: "quiesced" });
    expect(returned.listed.length).toBeGreaterThan(0);
    expect(returned.listed.every((name: string) => name === "pick")).toBe(true);
    expect(returned.child).toEqual({ reason: "failed", inputs: { thing: '"sky"' } });
  });

  it(".on({ model }) runs one call on another model through the gateway, and natlang.rerun replays a program call", async () => {
    const standard = makeTestCatalogEntry({ ref: "test:standard", id: "standard", name: "standard", provider: "test", baseUrl: "http://test.invalid/v1" });
    const asked: string[] = [];
    const { cell } = harness(
      {
        models: [standard],
        turn: async (input) => {
          asked.push(input.model);
          return input.model === standard.ref
            ? toolCallMessage("return_result", { status: "success", value: "red" })
            : toolCallMessage("return_result", { status: "blocked", reason: "the small model cannot tell" });
        },
      },
      files({ "skills/c/color.nl": "---\nargs:\n  thing: string\nreturns: string\n---\nName the color of thing.\n" })
    );
    const inline = await cell("return await nl<string>`Name a color.`.on({ model: 'test:standard' })();");
    expect(inline.value).toMatchObject({ success: true, returnValue: "red" });
    expect(inline.calls).toMatchObject([{ model: standard.ref }]);

    const failed = await cell("const color = await natlang.load('skills/c/color.nl');\nreturn await color('sky');");
    expect(failed.errorData).toMatchObject({ reason: "blocked", name: "color" });
    const rerun = await cell(`return await natlang.rerun(${JSON.stringify(failed.errorData.callId)}, { model: 'test:standard' });`);
    expect(rerun.value).toMatchObject({ success: true, returnValue: "red" });
    expect(asked).toEqual([standard.ref, EXECUTOR_ENTRY.ref, standard.ref]);

    const unknown = await cell("return await nl<string>`Name a color.`.on({ model: 'nope:x' })();");
    expect(unknown.errorData).toMatchObject({ reason: "model-unavailable" });

    const inlineRerun = await cell(`return await natlang.rerun(${JSON.stringify(unknown.errorData.callId)});`);
    expect(inlineRerun.seen).toContain("natlang.rerun replays a workspace program's function");
  });

  it("a program's budget frontmatter bounds its calls in place of the executor's", async () => {
    let turns = 0;
    const { cell } = harness(
      { turn: async () => (turns++, toolCallMessage("eval", { code: `return ${turns};` })) },
      files({ "skills/b/count.nl": "---\nargs: {}\nreturns: string\nbudget: { maxTurns: 2 }\n---\nCount.\n" })
    );
    const { errorData } = await cell("const count = await natlang.load('skills/b/count.nl');\nreturn await count();");
    expect(turns).toBe(2);
    expect(errorData).toMatchObject({ reason: "budget-exhausted" });
  });
});

describe("decisions and program errors in the result", () => {
  const decide = {
    "skills/t/triage.nl": "---\nargs:\n  ticket: string\nreturns: '\"urgent\" | \"normal\"'\nreadout: decision\n---\nDecide whether ticket is urgent.\n",
  };

  it("a scored decision shows its probability and runner-up, and flags a close call", async () => {
    const { calls, seen } = await harness(
      { score: async () => [Math.log(0.55), Math.log(0.45)] },
      files(decide)
    ).cell("const triage = await natlang.load('skills/t/triage.nl');\nreturn await triage('The site is slow.');");
    expect(calls[0]!.decision).toMatchObject({ mode: "scored", value: '"urgent"', runnerUp: '"normal"' });
    expect((calls[0]!.decision as { p: number }).p).toBeCloseTo(0.55);
    expect(seen).toContain('decision "urgent" 55%, runner-up "normal" 45%, LOW CONFIDENCE');
  });

  it("a model that cannot score runs the tool loop, and the summary says so", async () => {
    const { calls, seen } = await harness(
      { turn: async () => toolCallMessage("return_result", { status: "success", value: "normal" }) },
      files(decide)
    ).cell("const triage = await natlang.load('skills/t/triage.nl');\nreturn await triage('The font is odd.');");
    expect(calls[0]!.decision).toMatchObject({ mode: "tool-loop", reason: expect.stringContaining("decision-unsupported") });
    expect(seen).toContain("decision: not scored (decision-unsupported");
  });

  it("a program that does not compile is reported at its workspace path and frontmatter line", async () => {
    const { seen } = await harness(
      {},
      files({ "skills/x/judge.nl": "---\ndescription: Judge a note.\nargs:\n  note: Nope\nreturns: string\n---\nJudge note.\n" })
    ).cell("const judge = await natlang.load('skills/x/judge.nl');\nreturn await judge('a');");
    expect(seen).toContain(
      "[eval] Error: natlang program skills/x/judge.nl does not compile:\nskills/x/judge.nl:4:1 error callable-scope: unknown type name Nope"
    );
    expect(seen).toContain("[eval] Structured failure: natlang_program_refused.");
    expect(seen.match(/unknown type name Nope/g)).toHaveLength(1);
    expect(seen).not.toContain("Error stack");
  });

  it("a program whose services the eval lacks says why once", async () => {
    const { seen } = await harness(
      {},
      files({
        "skills/logs/probe.nl": "---\nargs: {}\nreturns: string\n---\nSay ok.\n",
        "skills/logs/services.d.ts": "declare module 'natlang:services' { export const serverLog: unknown; }",
      })
    ).cell("const probe = await natlang.load('skills/logs/probe.nl');\nreturn await probe();");
    const line = seen.split("\n").find((text) => text.startsWith("[eval] Error:"))!;
    expect(line).toMatch(/^\[eval\] Error: natlang program skills\/logs\/probe\.nl cannot get its services: /);
    expect(line.match(/serverLog/g)).toHaveLength(1);
    expect(seen.match(/serverLog/g)).toHaveLength(1);
  });
});
