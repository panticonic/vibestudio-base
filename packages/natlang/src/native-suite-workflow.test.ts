import { expect, it } from "vitest";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProgramLoader } from "./programs.js";
import {
  createNatlangRuntime,
  workerdPlatform,
} from "../vendor/workerd/natlang-workerd.js";
import { confinedRealm } from "./realm.js";
import { testNewFunction } from "./testSupport.js";

it("mounts suite verification through both route and result branches", async () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const plan = {
    target: "packages/example",
    suite: "native-in-name",
    runtime: "workerd",
    stateHash: "original",
    contextId: "workspace-context",
  };
  const execution = {
    status: "compilation-failed",
    current: true,
    reportDigest: "report",
    executionDigest: null,
    artifactKey: null,
    passed: null,
    failed: null,
    diagnostics: ["missing parser export"],
  };
  const scripts: Record<string, string> = {
    runWorkflow: `
      const report=await domains.testSuite.reviewTestSuite(request.work[0].input);
      return {results:[{kind:"domain",domain:"testSuite",operation:"reviewTestSuite",report}],remaining:[]};
    `,
    reviewTestSuite: `
      const plan=await testSuitePlanRead.resolve(request.operationId);
      const decision=await reviewPlan(plan,request.mode);
      const execution=await testSuiteVerificationRun.run(request.operationId,plan.stateHash);
      return {plan,decision,execution,result:await reviewResult(execution)};
    `,
    reviewPlan: `
      const route=await interpretRuntime(plan);
      return {route,next:await chooseRunDisposition(mode,route)};
    `,
    interpretRuntime:
      'return {runtime:plan.runtime,nativeApproval:plan.runtime==="native",explanation:"Declared "+plan.runtime};',
    chooseRunDisposition:
      'return mode==="verify"?"run-assignment":"report-plan";',
    reviewResult: `
      const outcome=await interpretOutcome(execution);
      return {outcome,followUp:await planFollowUp(outcome,execution)};
    `,
    interpretOutcome: "return execution.status;",
    planFollowUp: 'return "Inspect "+execution.diagnostics[0];',
  };
  const stages: string[] = [];
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      const name = session.lam.functionName!;
      stages.push(name);
      expect(Object.keys(session.availableServices())).toEqual(
        name === "reviewTestSuite"
          ? ["testSuitePlanRead", "testSuiteVerificationRun"]
          : [],
      );
      const code = scripts[name];
      if (!code) throw new Error("Unexpected suite stage " + name);
      const result = await session.applyAsync("eval", { code, finish: true });
      if (result.kind === "rejected") throw new Error(result.text);
    },
  });
  const loader = new ProgramLoader({
    platform,
    fs: {
      readFile: (path) => readFile(join(root, path), "utf8"),
      readdir: (path) => readdir(join(root, path), { withFileTypes: true }),
      stat: (path) => stat(join(root, path)),
    },
    bindings: {},
    runTask: (run, task) => runtime.run(run, task),
  });
  const reads: unknown[] = [];
  const run = (await loader.load("skills/vibestudio-workflows/runWorkflow.nl", {
    services: {
      testSuitePlanRead: {
        async resolve(id: string) {
          reads.push(id);
          return plan;
        },
      },
      testSuiteVerificationRun: {
        async run(id: string, stateHash: string) {
          reads.push([id, stateHash]);
          return execution;
        },
      },
    },
  })) as (value: unknown) => Promise<unknown>;
  const input = {
    goal: "Verify the declared test plan",
    operationId: "assigned-suite",
    target: plan.target,
    suite: plan.suite,
    file: null,
    testName: null,
    mode: "verify",
  };
  await expect(
    run({
      goal: input.goal,
      work: [
        {
          kind: "domain",
          domain: "testSuite",
          operation: "reviewTestSuite",
          input,
        },
      ],
    }),
  ).resolves.toMatchObject({
    results: [
      {
        report: {
          plan,
          execution,
          decision: {
            route: { runtime: "workerd", nativeApproval: false },
            next: "run-assignment",
          },
          result: {
            outcome: "compilation-failed",
            followUp: "Inspect missing parser export",
          },
        },
      },
    ],
  });
  expect(reads).toEqual([
    input.operationId,
    [input.operationId, plan.stateHash],
  ]);
  expect(stages).toEqual([
    "runWorkflow",
    "reviewTestSuite",
    "reviewPlan",
    "interpretRuntime",
    "chooseRunDisposition",
    "reviewResult",
    "interpretOutcome",
    "planFollowUp",
  ]);
});
