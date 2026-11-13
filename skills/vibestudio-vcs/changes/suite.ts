import { defineEvaluationSuite } from "@workspace/natlang/evaluation";
import {
  executorIdentityForChoice,
  loadModelConfiguration,
} from "@workspace/natlang/model";
import type { ChangeSummary, CommitProposal, Compare } from "./types.js";

type CaseInput = { function: "commit" | "summary"; compare: Compare };
type CaseExpected =
  | { mentions: string[]; intent: string | null }
  | {
      state: ChangeSummary["state"];
      attention: [string, "conflict" | "composed"][];
      mentions: string[];
    };

type App = {
  semanticCommitMessage(compare: Compare): Promise<CommitProposal>;
  summarizeChanges: { summarize(compare: Compare): Promise<ChangeSummary> };
};

const mentionsAny = (text: string, terms: readonly string[]) =>
  terms.length === 0 ||
  terms.some((term) => text.toLowerCase().includes(term.toLowerCase()));
const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

// Gates for porting (DECOMPOSITION.md): quality of at least 0.85 on validation and on the locked test split, per function.
export default defineEvaluationSuite<CaseInput, CaseExpected>({
  id: "vcs-changes-v1",
  program: { root: ".", id: "vcs-changes", entry: "natlang.ts" },
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
  budget: { maxRollouts: 60, maxProposals: 0, maxModelCalls: 800 },
  fixture: {
    async create(testCase, context) {
      const app = (await context.loadFreshProgram()) as App;
      const { function: which, compare } = testCase.input;
      return {
        execute: (): Promise<CommitProposal | ChangeSummary> =>
          context.runtime.run<CommitProposal | ChangeSummary>(() =>
            which === "commit"
              ? app.semanticCommitMessage(compare)
              : app.summarizeChanges.summarize(compare),
          ),
      };
    },
  },
  score(
    testCase,
    observation,
    outcome,
  ): {
    quality: number;
    metrics?: Record<string, number>;
    gates: Record<string, boolean>;
    feedback: string;
  } {
    const result = (observation as { result?: CommitProposal | ChangeSummary })
      .result;
    const expected = testCase.expected!;
    if (outcome.kind !== "returned" || !result) {
      return {
        quality: 0,
        gates: { completed: false, exact: false },
        feedback: `No result: ${outcome.error?.message ?? "no result"}`,
      };
    }
    if (testCase.input.function === "commit") {
      const proposal = result as CommitProposal;
      const want = expected as { mentions: string[]; intent: string | null };
      const oneLine =
        proposal.message.length > 0 &&
        proposal.message.length <= 72 &&
        !proposal.message.includes("\n");
      const grounded = mentionsAny(proposal.message, want.mentions);
      const intentRight = proposal.intent === want.intent;
      const quality =
        (oneLine ? 0.2 : 0) + (grounded ? 0.4 : 0) + (intentRight ? 0.4 : 0);
      return {
        quality,
        metrics: {
          oneLine: Number(oneLine),
          grounded: Number(grounded),
          intent: Number(intentRight),
        },
        gates: { completed: true, exact: intentRight },
        feedback: `"${proposal.message}" intent=${JSON.stringify(proposal.intent)}; want intent ${JSON.stringify(want.intent)}, mention one of ${JSON.stringify(want.mentions)}.`,
      };
    }
    const summary = result as ChangeSummary;
    const want = expected as {
      state: ChangeSummary["state"];
      attention: [string, string][];
      mentions: string[];
    };
    const exact =
      summary.state === want.state &&
      same(
        summary.attention.map((entry) => [entry.path, entry.why]),
        want.attention,
      );
    const sentences = [
      summary.headline,
      ...summary.units.map((unit) => unit.what),
    ];
    const groundedSentences = sentences.filter(
      (sentence) =>
        sentence.trim() !== "" &&
        (want.mentions.length === 0 || mentionsAny(sentence, want.mentions)),
    ).length;
    const grounded =
      sentences.length === 0 ? 1 : groundedSentences / sentences.length;
    return {
      quality: (exact ? 0.5 : 0) + 0.5 * grounded,
      metrics: { exact: Number(exact), grounded },
      gates: { completed: true, exact },
      feedback: `state ${summary.state} (want ${want.state}); headline "${summary.headline}"; ${groundedSentences}/${sentences.length} sentences grounded.`,
    };
  },
  feedback(testCase, result) {
    return {
      input: {
        function: testCase.input.function,
        files: testCase.input.compare.coordinates.length,
      },
      actual: result.outcome.value ?? null,
    };
  },
});
