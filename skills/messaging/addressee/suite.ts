import { defineEvaluationSuite } from "@workspace/natlang/evaluation";
import {
  executorIdentityForChoice,
  loadModelConfiguration,
} from "@workspace/natlang/model";
import type { AddresseeRow, Resolution } from "./types.js";

type CaseInput = { utterance: string; roster: AddresseeRow[] };
type CaseExpected =
  | { kind: "ref"; ref: string }
  | { kind: "ambiguous"; reason: "several" | "none" };

/** The `addressees` service answering from one recorded roster. */
const recordedAddressees = (roster: AddresseeRow[]) => ({
  async list() {
    return roster.map((row) => ({ ...row }));
  },
});

// Gates for porting (DECOMPOSITION.md): accuracy of at least 0.85 on validation and on the locked test split, and no
// case on which a message would reach a recipient other than the one the user named.
export default defineEvaluationSuite<CaseInput, CaseExpected>({
  id: "resolve-addressee-v1",
  program: { root: ".", id: "resolve-addressee", entry: "natlang.ts" },
  components: "lambda-only",
  cases: "./cases.jsonl",
  models: { executor: "default" },
  executorIdentity: executorIdentityForChoice(
    loadModelConfiguration("default").choice,
  ),
  policy: {
    codeEdits: "deny",
    settings: { maxTurns: 6, turnTokens: 512, contextTokens: 8192 },
  },
  budget: { maxRollouts: 80, maxProposals: 0, maxModelCalls: 600 },
  fixture: {
    async create(testCase, context) {
      const app = (await context.loadFreshProgram()) as {
        resolveAddressee: { resolve(utterance: string): Promise<Resolution> };
      };
      const services = {
        addressees: recordedAddressees(testCase.input.roster),
      };
      return {
        execute: () =>
          context.runtime.run(
            () => app.resolveAddressee.resolve(testCase.input.utterance),
            { services },
          ),
      };
    },
  },
  score(testCase, observation, outcome) {
    const result = (observation as { result?: Resolution }).result;
    const expected = testCase.expected!;
    if (outcome.kind !== "returned" || !result) {
      return {
        quality: 0,
        gates: { completed: false, noWrongRecipient: false },
        feedback: `No resolution: ${outcome.error?.message ?? "no result"}`,
      };
    }
    const correct =
      expected.kind === "ref"
        ? result.kind === "ref" && result.ref === expected.ref
        : result.kind === "ambiguous" && result.reason === expected.reason;
    // A message that would reach someone else is the one failure the function exists to prevent.
    const wrongRecipient =
      result.kind === "ref" &&
      (expected.kind !== "ref" || result.ref !== expected.ref);
    return {
      quality: correct ? 1 : 0,
      metrics: {
        wrongRecipient: wrongRecipient ? 1 : 0,
        askedUnnecessarily:
          expected.kind === "ref" && result.kind === "ambiguous" ? 1 : 0,
      },
      gates: { completed: true, noWrongRecipient: !wrongRecipient },
      feedback: correct
        ? "Correct."
        : `Expected ${JSON.stringify(expected)}; observed ${JSON.stringify(result.kind === "ref" ? { kind: "ref", ref: result.ref } : { kind: "ambiguous", reason: result.reason })}.`,
    };
  },
  feedback(testCase, result) {
    return { input: testCase.input, actual: result.outcome.value ?? null };
  },
});
