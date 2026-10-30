import { describe, expect, it } from "vitest";
import { executeSandbox } from "@workspace/eval";
import { createEvalNatlang } from "./evalNatlang.js";
import { EXECUTOR_ENTRY, fakeRpc, testNewFunction, toolCallMessage, type FakeServices } from "./testSupport.js";

/**
 * The provider as the EvalDO drives it, with the real eval engine: the cell is
 * lowered by the provider, the engine transforms and executes the lowered code
 * in its confined realm with the provider's ambient values injected, inside the
 * provider's `runCell`. The model is scripted behind the gateway. The EvalDO's
 * own sequencing (precheck, lazy load, result shape) is covered by the host's
 * `EvalDO.natlang.test.ts` and the managed-instance system test.
 */
function harness(services: FakeServices, scope: Record<string, unknown> = {}) {
  const { rpc } = fakeRpc(services);
  const newFunction = testNewFunction();
  const natlang = createEvalNatlang({
    newFunction,
    bindings: { rpc, fs: {} },
    owner: { kind: "agent", objectKey: "agent:test", agentRef: "agent-1", channelId: "chan-1" },
  });
  async function run(code: string) {
    const lowered = natlang.lowerCell(code, {
      fileName: "cell.ts",
      jsx: false,
      ambientNames: ["scope", "rpc", "fs"],
      scopeValues: scope,
    });
    if (lowered.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      return { lowered, failed: lowered.diagnostics };
    }
    const { value, calls } = await natlang.runCell(
      () =>
        executeSandbox(lowered.code, {
          syntax: "typescript",
          bindings: { ...natlang.ambient, scope, rpc, fs: {} },
          moduleMap: {},
          require: (id: string) => {
            throw new Error(`Module not found: ${id}`);
          },
          compileFunction: (argNames, body) => newFunction(body, "eval", ...argNames),
          confinement: "private-global",
        }),
      { runId: "run-1", signal: new AbortController().signal }
    );
    return { lowered, value, calls };
  }
  return { run };
}

describe("natlang with the eval engine", () => {
  it("runs a cell that calls nl on a scope value and reports the call", async () => {
    const asked: any[] = [];
    const { run } = harness(
      {
        turn: async (input) => {
          asked.push(input);
          return toolCallMessage("return_result", { status: "success", value: "urgent" });
        },
      },
      { ticket: { id: 7, text: "The site is down for every customer." } }
    );
    const result = await run(
      "const verdict: 'urgent' | 'normal' = await nl`Decide whether ${scope.ticket} is urgent.`(scope.ticket);\nreturn verdict;"
    );
    expect(result.value).toMatchObject({ success: true, returnValue: "urgent" });
    expect(result.calls).toMatchObject([
      { outcome: "done", model: EXECUTOR_ENTRY.ref, turns: 1, promptTokens: 11, completionTokens: 7 },
    ]);
    expect(JSON.stringify(asked[0].context.messages)).toContain("The site is down");
  });

  it("surfaces a failed natlang call as the cell's user-code failure with its outcome and detail", async () => {
    const { run } = harness({
      turn: async () => toolCallMessage("return_result", { status: "blocked", reason: "no ticket text" }),
    });
    const result = await run("return await nl<string>`Summarize the ticket.`();");
    expect(result.value).toMatchObject({ success: false, failureKind: "user-code" });
    expect(JSON.stringify((result.value as any).error)).toContain("no ticket text");
    expect(result.calls).toMatchObject([{ outcome: "quiesced" }]);
  });

  it("does not run a cell natlang cannot lower, and reports where", async () => {
    const { run } = harness({});
    const result = await run("const gone = 1;\nawait nl`Greet.`(;");
    expect(result.failed?.[0]).toMatchObject({ severity: "error", line: 2 });
    expect(result.value).toBeUndefined();
  });
});
