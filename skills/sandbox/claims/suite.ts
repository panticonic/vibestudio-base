import { defineEvaluationSuite } from "@workspace/natlang/evaluation";
import { executorIdentityForChoice, loadModelConfiguration } from "@workspace/natlang/model";
import type { Claim, ClaimCheck, ClaimVerdict } from "./types.js";

type CaseInput = { text: string; claims: Claim[] };
type CaseExpected = { verdicts: Record<string, ClaimVerdict> };

// Gates for porting (DECOMPOSITION.md): the verdicts are right on at least 0.85 of validation and of the locked test
// split. The cases carry no match patterns, so every claim is the executor's judgment.
export default defineEvaluationSuite<CaseInput, CaseExpected>({
  id: "claim-check-v1",
  program: { root: ".", id: "claim-check", entry: "natlang.ts" },
  components: "lambda-only",
  cases: "./cases.jsonl",
  models: { executor: "default" },
  executorIdentity: executorIdentityForChoice(loadModelConfiguration("default").choice),
  policy: { codeEdits: "deny", settings: { maxTurns: 6, turnTokens: 512, contextTokens: 8192 } },
  budget: { maxRollouts: 60, maxProposals: 0, maxModelCalls: 600 },
  fixture: {
    async create(testCase, context) {
      const app = (await context.loadFreshProgram()) as {
        claimCheck(text: string, claims: Claim[]): Promise<ClaimCheck>;
      };
      return {
        execute: () =>
          context.runtime.run(() => app.claimCheck(testCase.input.text, testCase.input.claims)),
      };
    },
  },
  score(testCase, observation, outcome) {
    const result = (observation as { result?: ClaimCheck }).result;
    const expected = testCase.expected!.verdicts;
    if (outcome.kind !== "returned" || !result) {
      return {
        quality: 0,
        gates: { completed: false, quoted: false },
        feedback: `No verdicts: ${outcome.error?.message ?? "no result"}`,
      };
    }
    const misses = Object.entries(expected).flatMap(([id, want]) => {
      const got = result.verdicts.find((verdict) => verdict.id === id)?.verdict;
      return got === want ? [] : [`${id}: expected ${want}, got ${got ?? "nothing"}`];
    });
    const total = Object.keys(expected).length;
    return {
      quality: (total - misses.length) / total,
      metrics: { claims: total, wrong: misses.length },
      gates: {
        completed: true,
        // A quote is always a slice of the text, never written by the model.
        quoted: result.verdicts.every((verdict) => verdict.quote === undefined || testCase.input.text.includes(verdict.quote)),
      },
      feedback: misses.length ? misses.join("; ") : "Correct.",
    };
  },
  feedback(testCase, result) {
    return { input: testCase.input.claims.map((claim) => claim.id), actual: result.outcome.value ?? null };
  },
});
