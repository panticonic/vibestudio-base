import { defineEvaluationSuite } from "@workspace/natlang/evaluation";
import { executorIdentityForChoice, loadModelConfiguration } from "@workspace/natlang/model";
import type { DefectClass, Evidence } from "./types.js";

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
  policy: { codeEdits: "deny", settings: { maxTurns: 8, turnTokens: 1024, contextTokens: 8192 } },
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
