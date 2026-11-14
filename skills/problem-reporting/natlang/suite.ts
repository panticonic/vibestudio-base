import { defineEvaluationSuite } from "@workspace/natlang/evaluation";
import { executorIdentityForChoice, loadModelConfiguration } from "@workspace/natlang/model";
import type { DefectClass, Evidence } from "./types.js";

// The executor's production call budget (Base model-catalog MODEL_ROLE_CALL_BUDGETS.executor): the gates measure the
// bounds the program runs under. A suite cannot import workspace source, so it is restated here.
const EXECUTOR_BUDGET = { maxTurns: 12, maxTokens: 16384 };

/** What `score` returns: the gates are a plain boolean record. */
type Metric = {
  quality: number;
  gates: Record<string, boolean>;
  feedback: string;
};

type CaseInput = { function: "classifyDefect"; input: Evidence };

// Gates for porting (DECOMPOSITION.md): at least 0.85 accuracy on validation and on the locked test split with no
// false `platform`.
export default defineEvaluationSuite<CaseInput, DefectClass>({
  id: "problem-reporting-v1",
  program: { root: ".", id: "problem-reporting", entry: "natlang.ts" },
  components: "lambda-only",
  cases: "./cases.jsonl",
  models: { executor: "default" },
  executorIdentity: executorIdentityForChoice(loadModelConfiguration("default").choice),
  policy: { codeEdits: "deny", settings: EXECUTOR_BUDGET },
  budget: { maxRollouts: 80, maxProposals: 0, maxModelCalls: 1200 },
  fixture: {
    async create(testCase, context) {
      const app = (await context.loadFreshProgram()) as {
        classifyDefect(evidence: Evidence): Promise<DefectClass>;
      };
      return { execute: () => context.runtime.run(() => app.classifyDefect(testCase.input.input)) };
    },
  },
  score(testCase, observation, outcome): Metric {
    const got = (observation as { result?: DefectClass }).result;
    const want = testCase.expected!;
    const exact = outcome.kind === "returned" && got === want;
    return {
      quality: exact ? 1 : 0,
      // A false platform report costs the user's attention; it is the error this function exists to prevent.
      gates: {
        completed: outcome.kind === "returned",
        exact,
        noFalsePlatform: !(want !== "platform" && got === "platform"),
      },
      feedback: exact ? "Correct." : `Expected ${want}; got ${got ?? outcome.error?.outcome}.`,
    };
  },
  feedback(testCase, result) {
    return { input: testCase.input.function, actual: result.outcome.value ?? null };
  },
});
