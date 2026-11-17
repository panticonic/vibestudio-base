import fs from "node:fs";
import path from "node:path";
import { defineEvaluationSuite } from "@workspace/natlang/evaluation";
import { executorIdentityForChoice, loadModelConfiguration } from "@workspace/natlang/model";

// The executor's production call budget (Base model-catalog MODEL_ROLE_CALL_BUDGETS.executor): the gates measure the
// bounds the program runs under. A suite cannot import workspace source, so it is restated here.
const EXECUTOR_BUDGET = { maxTurns: 12, maxTokens: 16384 };

type Unit = { name: string; kind: string; description: string };
type Expected = { family: "brand" | "lucide" | "emoji"; accept: string[] };
type Choice = { family: string; id: string };

/** The shipped icon catalog, read from the skill's own assets the way the eval `fs` would list it. */
function recordedCatalog(programRoot: string) {
  return {
    async readdir(request: string): Promise<string[]> {
      const directory = request.replace("skills/workspace-dev/assets/icons/", "");
      return fs.readdirSync(path.join(programRoot, "../assets/icons", directory));
    },
  };
}

// Gates for porting (DECOMPOSITION.md): mean quality of at least 0.8 on validation and on the locked test split.
// A case scores half for the right family and half for a catalog id in its accepted set (any single emoji for "emoji").
export default defineEvaluationSuite({
  id: "workspace-dev-icons-v1",
  program: { root: ".", id: "workspace-dev-natlang", entry: "natlang.ts" },
  components: "lambda-only",
  cases: "./cases.jsonl",
  models: { executor: "default" },
  executorIdentity: executorIdentityForChoice(loadModelConfiguration("default").choice),
  policy: { codeEdits: "deny", settings: EXECUTOR_BUDGET },
  budget: { maxRollouts: 40, maxProposals: 0, maxModelCalls: 200 },
  fixture: {
    async create(testCase, context) {
      const app = (await context.loadFreshProgram()) as { unitIcon(unit: Unit, fs: ReturnType<typeof recordedCatalog>): Promise<Choice> };
      const catalog = recordedCatalog(context.programRoot);
      const unit = (testCase.input as { args: [Unit] }).args[0];
      return { execute: () => context.runtime.run(() => app.unitIcon(unit, catalog)) };
    },
  },
  score(testCase, observation: unknown, outcome) {
    const expected = testCase.expected as Expected;
    const choice = (observation as { result?: Choice }).result;
    if (outcome.kind !== "returned" || !choice) {
      return { quality: 0, gates: { completed: false }, feedback: `No icon: ${outcome.error?.message ?? "no result"}` };
    }
    const family = choice.family === expected.family;
    const identified = expected.family === "emoji" ? choice.family === "emoji" : expected.accept.includes(choice.id);
    return {
      quality: (family ? 0.5 : 0) + (identified ? 0.5 : 0),
      gates: { completed: true },
      feedback: `Expected ${expected.family} ${expected.accept.join("|") || "(an emoji)"}; got ${choice.family} ${choice.id}.`,
    };
  },
  feedback(testCase, result) {
    return { input: testCase.input, actual: result.outcome.value ?? null };
  },
});
