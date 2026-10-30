import { defineEvaluationSuite } from "@workspace/natlang/evaluation";
import { executorIdentityForChoice, loadModelConfiguration } from "@workspace/natlang/model";
import type { DefectClass, Draft, Evidence } from "./types.js";

/** What `score` returns: the gates are a plain boolean record, whichever function the case exercises. */
type Metric = {
  quality: number;
  metrics?: Record<string, number>;
  gates: Record<string, boolean>;
  feedback: string;
};

/** One suite, two functions: each case names the function it exercises. */
type CaseInput =
  | { function: "classifyDefect"; input: Evidence }
  | {
      function: "draftProblemReport";
      input: { evidence: Evidence; recording: { diagnose: unknown } };
    };
type CaseExpected = DefectClass | { include: string[]; exclude: string[] };

const OPERATION_TOKEN = /^[A-Za-z0-9_.:@/-]+$/;

/** The two read-only services a draft uses, answering from the recording. */
function recordedServices(recording: { diagnose: unknown }) {
  return {
    problemReports: {
      async availability() {
        return {
          submissionAccess: "anonymous",
          incidents: 0,
          destination: "https://vibestudio.app/v1/problem-reports",
          policy: "manual reports need a one-time approval",
          limits: {},
        };
      },
    },
    gad: {
      async diagnoseInvocation() {
        const recorded = recording.diagnose as { error?: string } | null;
        if (recorded && typeof recorded.error === "string") throw new Error(recorded.error);
        return recorded;
      },
    },
  };
}

// Gates for porting (DECOMPOSITION.md): classifyDefect at least 0.85 accuracy on validation and on the locked test
// split with no false `platform`; draftProblemReport every gate on every case.
export default defineEvaluationSuite<CaseInput, CaseExpected>({
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
        draftProblemReport: { collect(evidence: Evidence): Promise<Draft> };
      };
      const input = testCase.input;
      if (input.function === "classifyDefect") {
        return { execute: () => context.runtime.run(() => app.classifyDefect(input.input)) };
      }
      const services = recordedServices(input.input.recording);
      return {
        execute: () =>
          context.runtime.run(() => app.draftProblemReport.collect(input.input.evidence), {
            services,
          }),
      };
    },
  },
  score(testCase, observation, outcome): Metric {
    const result = (observation as { result?: unknown }).result;
    const expected = testCase.expected!;
    if (testCase.input.function === "classifyDefect") {
      const got = result as DefectClass | undefined;
      const want = expected as DefectClass;
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
    }
    const draft = result as Draft | undefined;
    const { evidence } = testCase.input.input;
    const { include, exclude } = expected as { include: string[]; exclude: string[] };
    if (outcome.kind !== "returned" || !draft) {
      return {
        quality: 0,
        gates: { completed: false },
        feedback: `No draft: ${outcome.error?.message ?? "no result"}`,
      };
    }
    const text = [
      draft.problem.symptom,
      draft.problem.expected,
      ...draft.narrative.map((section) => section.markdown),
    ]
      .join("\n")
      .toLowerCase();
    const everything = JSON.stringify(draft).toLowerCase();
    const included = include.filter((fact) => text.includes(fact.toLowerCase()));
    const sections = new Set(draft.narrative.map((section) => section.section));
    const gates = {
      completed: true,
      noSecrets: exclude.every((secret) => !everything.includes(secret.toLowerCase())),
      // The user's account is observed only when the agent reproduced it; the platform's diagnostic is observed.
      claims:
        evidence.reproduced ||
        draft.narrative.every(
          (section) => section.claims !== "observed" || section.section === "findings"
        ),
      shape:
        sections.has("goal") && sections.has("symptom") && draft.problem.symptom.trim().length > 0,
      operation:
        draft.problem.operation ===
        (evidence.operation && OPERATION_TOKEN.test(evidence.operation)
          ? evidence.operation
          : null),
    };
    return {
      quality: include.length ? included.length / include.length : 1,
      metrics: {
        included: included.length,
        wanted: include.length,
        sections: draft.narrative.length,
      },
      gates,
      feedback: `facts ${included.length}/${include.length}; gates ${
        Object.entries(gates)
          .filter(([, ok]) => !ok)
          .map(([name]) => name)
          .join(", ") || "all passed"
      }`,
    };
  },
  feedback(testCase, result) {
    return { input: testCase.input.function, actual: result.outcome.value ?? null };
  },
});
