import { defineEvaluationSuite } from "@workspace/natlang/evaluation";
import { executorIdentityForChoice, loadModelConfiguration } from "@workspace/natlang/model";
import type {
  ChannelRef,
  ChannelSummary,
  EnvelopePage,
  HealthReport,
  Standing,
  Urgency,
} from "./types.js";

/** What `score` returns: the gates are a plain boolean record, whichever function the case exercises. */
type Metric = {
  quality: number;
  metrics?: Record<string, number>;
  gates: Record<string, boolean>;
  feedback: string;
};

/** One suite, two functions: each case names the function it exercises. */
type CaseInput =
  | { function: "inspectAgentHealth"; input: { ref: ChannelRef; inspection: unknown } }
  | { function: "summarizeChannel"; input: { pages: EnvelopePage[] } };
type CaseExpected =
  | { status: HealthReport["status"]; urgencies: Record<string, Urgency> }
  | { standing: Standing; envelopes: number };

// Gates for porting (DECOMPOSITION.md): inspectAgentHealth and summarizeChannel each reach mean quality of at least
// 0.85 on validation and on the locked test split, with `status` / `state` and the exact counts right on every case.
export default defineEvaluationSuite<CaseInput, CaseExpected>({
  id: "gad-context-v1",
  program: { root: ".", id: "gad-context", entry: "natlang.ts" },
  components: "lambda-only",
  cases: "./cases.jsonl",
  models: { executor: "default" },
  executorIdentity: executorIdentityForChoice(loadModelConfiguration("default").choice),
  policy: { codeEdits: "deny", settings: { maxTurns: 6, turnTokens: 1024, contextTokens: 8192 } },
  budget: { maxRollouts: 80, maxProposals: 0, maxModelCalls: 1200 },
  fixture: {
    async create(testCase, context) {
      const app = (await context.loadFreshProgram()) as {
        inspectAgentHealth: { collect(ref: ChannelRef): Promise<HealthReport> };
        summarizeChannel: { collect(pages: EnvelopePage[]): Promise<ChannelSummary> };
      };
      const input = testCase.input;
      if (input.function === "summarizeChannel") {
        return {
          execute: () => context.runtime.run(() => app.summarizeChannel.collect(input.input.pages)),
        };
      }
      // The recorded snapshot of the `gad` service; the program reads it once.
      const services = {
        gad: {
          async inspectAgentHealth() {
            return input.input.inspection;
          },
        },
      };
      return {
        execute: () =>
          context.runtime.run(() => app.inspectAgentHealth.collect(input.input.ref), { services }),
      };
    },
  },
  score(testCase, observation, outcome): Metric {
    const result = (observation as { result?: unknown }).result;
    const expected = testCase.expected!;
    if (testCase.input.function === "inspectAgentHealth") {
      const report = result as HealthReport | undefined;
      const want = expected as {
        status: HealthReport["status"];
        urgencies: Record<string, Urgency>;
      };
      if (outcome.kind !== "returned" || !report) {
        return {
          quality: 0,
          gates: { completed: false, listed: false, status: false },
          feedback: `No report: ${outcome.error?.message ?? "no result"}`,
        };
      }
      const wanted = Object.entries(want.urgencies);
      const right = wanted.filter(
        ([kind, urgency]) =>
          report.findings.find((finding) => finding.kind === kind)?.urgency === urgency
      ).length;
      const listed =
        report.findings.length === wanted.length &&
        wanted.every(([kind]) => report.findings.some((finding) => finding.kind === kind));
      return {
        quality: wanted.length ? right / wanted.length : report.findings.length === 0 ? 1 : 0,
        metrics: { right, findings: wanted.length },
        gates: { completed: true, listed, status: report.status === want.status },
        feedback: `status ${report.status} (want ${want.status}); urgency right ${right}/${wanted.length}`,
      };
    }
    const summary = result as ChannelSummary | undefined;
    const want = expected as { standing: Standing; envelopes: number };
    if (outcome.kind !== "returned" || !summary) {
      return {
        quality: 0,
        gates: { completed: false, counted: false, standing: false },
        feedback: `No summary: ${outcome.error?.message ?? "no result"}`,
      };
    }
    const counted = summary.range.envelopes === want.envelopes;
    const standing = summary.standing === want.standing;
    return {
      quality: (Number(counted) + Number(standing)) / 2,
      metrics: { counted: Number(counted), standing: Number(standing) },
      gates: { completed: true, counted, standing },
      feedback: `standing ${summary.standing} (want ${want.standing}); ${summary.range.envelopes} envelopes (want ${want.envelopes})`,
    };
  },
  feedback(testCase, result) {
    return { input: testCase.input.function, actual: result.outcome.value ?? null };
  },
});
