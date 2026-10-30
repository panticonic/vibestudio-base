import { defineEvaluationSuite } from "@workspace/natlang/evaluation";
import { executorIdentityForChoice, loadModelConfiguration } from "@workspace/natlang/model";

/** One case calls one exported function of `natlang.ts` with `args`; `expected` is its exact result. */
type CaseInput = { function: "provenanceMechanism"; args: unknown[] };

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

// Gates for porting (DECOMPOSITION.md): accuracy of at least 0.85 on validation and on the locked test split.
export default defineEvaluationSuite({
  id: "provenance-orientation-v1",
  program: { root: ".", id: "provenance-orientation", entry: "natlang.ts" },
  components: "lambda-only",
  cases: "./cases.jsonl",
  models: { executor: "default" },
  executorIdentity: executorIdentityForChoice(loadModelConfiguration("default").choice),
  policy: { codeEdits: "deny", settings: { maxTurns: 6, turnTokens: 512, contextTokens: 8192 } },
  budget: { maxRollouts: 60, maxProposals: 0, maxModelCalls: 400 },
  fixture: {
    async create(testCase, context) {
      const app = (await context.loadFreshProgram()) as Record<string, (...args: unknown[]) => Promise<unknown>>;
      const input = testCase.input as CaseInput;
      return { execute: () => context.runtime.run(() => app[input.function]!(...input.args)) };
    },
  },
  score(testCase, observation: unknown, outcome) {
    const result = (observation as { result?: unknown }).result;
    const correct = outcome.kind === "returned" && same(result, testCase.expected);
    return {
      quality: correct ? 1 : 0,
      gates: { completed: outcome.kind === "returned" },
      feedback: correct ? "Correct." : `Expected ${JSON.stringify(testCase.expected)}; observed ${JSON.stringify(result ?? outcome.error)}.`,
    };
  },
  feedback(testCase, result) {
    return { input: testCase.input, actual: result.outcome.value ?? null };
  },
});
