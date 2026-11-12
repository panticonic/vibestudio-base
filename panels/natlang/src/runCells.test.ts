import { describe, expect, it } from "vitest";
import { askCell, callCell, templateText } from "./runCells.js";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...values: unknown[]) => Promise<unknown>;

/** Run a call cell against a fake `natlang` the way the eval engine would. */
async function runCall(cell: string, fields: Array<{ name: string; required: boolean }>) {
  const calls: unknown[][] = [];
  const natlang = {
    describe: async (path: string) => ({ functions: [{ name: "classify", source: path.split("/").at(-1), fields }] }),
    load: async () => async (...args: unknown[]) => {
      calls.push(args);
      return "ok";
    },
  };
  const result = await new AsyncFunction("natlang", cell)(natlang);
  return { result, calls };
}

describe("callCell", () => {
  const fields = [
    { name: "ticket", required: true },
    { name: "limit", required: false },
  ];

  it("passes the named inputs in the order the signature declares them", async () => {
    const cell = callCell({ function: "skills/triage/classify.nl", inputs: { limit: 3, ticket: "down" } });
    expect(await runCall(cell, fields)).toEqual({ result: "ok", calls: [["down", 3]] });
  });

  it("leaves an optional input undefined and refuses a missing required one, naming it", async () => {
    expect((await runCall(callCell({ function: "skills/triage/classify.nl", inputs: { ticket: "x" } }), fields)).calls).toEqual([["x", undefined]]);
    await expect(runCall(callCell({ function: "skills/triage/classify.nl", inputs: {} }), fields)).rejects.toThrow("Missing input: ticket");
  });

  it("names a function the program does not define", async () => {
    await expect(runCall(callCell({ function: "skills/triage/other.nl" }), fields)).rejects.toThrow("No natlang function other in skills/triage/other.nl");
  });
});

describe("askCell", () => {
  it("is an inline nl call with the result type and the input as its argument", () => {
    expect(askCell({ instruction: "Summarize the input.", input: "Hi team", returns: "{ summary: string }" })).toBe(
      'const input = "Hi team";\nreturn await nl<{ summary: string }>`Summarize the input.`(input);'
    );
    expect(askCell({ instruction: "x" })).toContain("nl<string>`x`(input)");
  });

  it("cannot be broken out of by the instruction", () => {
    const text = templateText("a `tick` and ${inject} and \\ slash");
    expect(text).toBe("a \\`tick\\` and \\${inject} and \\\\ slash");
    // As a template literal it reads back as the original.
    expect(new Function(`return \`${text}\`;`)()).toBe("a `tick` and ${inject} and \\ slash");
  });
});
