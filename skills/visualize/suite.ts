import { defineEvaluationSuite } from "@natlang/node/evaluation";
import { executorIdentityForChoice, loadModelConfiguration } from "@natlang/node/model";

/** One case calls one exported function of `natlang.ts` with `args`. */
type CaseInput = { function: "chooseComponent" | "componentProps"; args: unknown[] };

type Json = unknown;

/** Leaf values of `expected` that `actual` also holds at the same path; arrays compare element by element. */
function covered(expected: Json, actual: Json): { matched: number; total: number } {
  if (Array.isArray(expected)) {
    const parts = expected.map((item, index) => covered(item, Array.isArray(actual) ? actual[index] : undefined));
    const lengthOk = Array.isArray(actual) && actual.length === expected.length ? 1 : 0;
    return {
      matched: lengthOk + parts.reduce((sum, part) => sum + part.matched, 0),
      total: 1 + parts.reduce((sum, part) => sum + part.total, 0),
    };
  }
  if (expected !== null && typeof expected === "object") {
    const parts = Object.entries(expected).map(([key, value]) =>
      covered(value, actual !== null && typeof actual === "object" ? (actual as Record<string, Json>)[key] : undefined)
    );
    return {
      matched: parts.reduce((sum, part) => sum + part.matched, 0),
      total: parts.reduce((sum, part) => sum + part.total, 0),
    };
  }
  return { matched: JSON.stringify(expected) === JSON.stringify(actual) ? 1 : 0, total: 1 };
}

// Gates for porting (DECOMPOSITION.md): chooseComponent accuracy of at least 0.85 on validation and test;
// componentProps mean coverage of at least 0.85 with every case rendering.
export default defineEvaluationSuite({
  id: "visualize-v1",
  program: { root: ".", id: "visualize", entry: "natlang.ts" },
  components: "lambda-only",
  cases: "./cases.jsonl",
  models: { executor: "default" },
  executorIdentity: executorIdentityForChoice(loadModelConfiguration("default").choice),
  policy: { codeEdits: "deny", settings: { maxTurns: 6, turnTokens: 1024, contextTokens: 8192 } },
  budget: { maxRollouts: 80, maxProposals: 0, maxModelCalls: 500 },
  fixture: {
    async create(testCase, context) {
      const app = (await context.loadFreshProgram()) as Record<string, (...args: unknown[]) => Promise<unknown>>;
      const input = testCase.input as CaseInput;
      return { execute: () => context.runtime.run(() => app[input.function]!(...input.args)) };
    },
  },
  score(testCase, observation: unknown, outcome) {
    const result = (observation as { result?: Json }).result;
    const completed = outcome.kind === "returned";
    const input = testCase.input as CaseInput;
    if (input.function === "chooseComponent") {
      const correct = completed && result === testCase.expected;
      return {
        quality: correct ? 1 : 0,
        gates: { completed },
        feedback: correct ? "Correct." : `Expected ${String(testCase.expected)}; observed ${String(result ?? outcome.error?.message)}.`,
      };
    }
    const { matched, total } = completed ? covered(testCase.expected, result) : { matched: 0, total: 1 };
    return {
      quality: matched / total,
      metrics: { matched, total },
      gates: { completed, rendered: completed && typeof (result as { mdx?: unknown } | undefined)?.mdx === "string" },
      feedback: `${matched} of ${total} expected values held.${completed ? "" : ` ${outcome.error?.message ?? ""}`}`,
    };
  },
  feedback(testCase, result) {
    return { input: testCase.input, actual: result.outcome.value ?? null };
  },
});
