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

it("runs two skill trees from the same package using only the caller's scoped bindings", async () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const seen: Record<string, string[]> = {};
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      const name = session.lam.functionName!;
      seen[name] = Object.keys(session.availableServices());
      if (name === "checkSupport") {
        const guide = await session.applyAsync("read_code", {
          name: "skills.workspace-evidence",
        });
        expect(guide.kind).not.toBe("rejected");
        expect(JSON.stringify(guide)).toContain("A green build");
      }
      const commands: Record<string, string> = {
        runWorkflow: `
          const repair=await repairUnit(request.work[0].input);
          const integration=await integrateWorkspace(request.work[1].input);
          return {results:[{kind:"repairUnit",report:repair},{kind:"integrateWorkspace",report:integration}],remaining:[]};
        `,
        repairUnit: `
          const current=await unitRepair.observe();
          const diagnosis=await diagnose(request,current,[]);
          return {status:"blocked",revision:current.revision,detail:diagnosis.cause,evidence:diagnosis.evidence};
        `,
        diagnose:
          'return {cause:"Fixture compiler failure",evidence:[evidence.revision],paths:[],hypothesis:"Fixture"};',
        integrateWorkspace: `
          const resulting=await workspaceIntegration.observe();
          const verification=await verifyIntegration(request,resulting,{requiredCurrent:[request.goal],requiredSource:[],preserve:[],compatible:true,evidence:[],missing:[]},resulting);
          return {status:verification.passed?"integrated":"blocked",head:resulting.head,evidence:verification.evidence,detail:"Checked"};
        `,
        verifyIntegration: `
          const support=await checkSupport(analysis.requiredCurrent,result.evidence);
          return {passed:support.missing.length===0,evidence:result.evidence,missing:support.missing};
        `,
        checkSupport:
          "return {supported:required.filter(item=>observed.includes(item)),missing:required.filter(item=>!observed.includes(item))};",
      };
      const code = commands[name];
      if (code === undefined) throw new Error("Unexpected skill " + name);
      const response = await session.applyAsync("eval", { code, finish: true });
      if (response.kind === "rejected") throw new Error(response.text);
    },
  });
  const loader = new ProgramLoader({
    platform,
    fs: {
      readFile: (path) => readFile(join(root, path), "utf8"),
      readdir: (path) => readdir(join(root, path), { withFileTypes: true }),
      stat: (path) => stat(join(root, path)),
    },
    // An ambient binding must never enter the explicit fixture.
    bindings: { ownedOperations: {} },
    runTask: (run, task) => runtime.run(run, task),
  });
  const program = "skills/vibestudio-workflows/runWorkflow.nl";
  const description = await loader.describe(program);
  expect(description.services).toContain("ownedOperations");
  const run = (await loader.load(program, {
    services: {
      unitRepair: {
        observe: async () => ({
          revision: "seed-repair",
          build: {
            stateHash: "seed",
            repoPath: "workers/example",
            status: "failed",
            diagnostics: [],
            builds: [],
          },
          tests: null,
        }),
        listSource: async () => [],
        readSource: async () => [],
      },
      workspaceIntegration: {
        observe: async () => ({
          head: "seed-integration",
          source: "source",
          currentIntent: [],
          sourceIntent: [],
          coordinates: [],
          files: [],
          remaining: [],
          evidence: ["Preserve settings"],
        }),
        apply: async () => ({}),
        merge: async () => ({}),
      },
    },
  })) as (value: unknown) => Promise<unknown>;
  await expect(
    run({
      goal: "Inspect the worker and integrate the assigned workspace changes",
      work: [
        {
          kind: "repairUnit",
          input: {
            unit: "workers/example",
            suite: "unit",
            goal: "Find the failure",
          },
        },
        { kind: "integrateWorkspace", input: { goal: "Preserve settings" } },
      ],
    }),
  ).resolves.toMatchObject({
    results: [
      { kind: "repairUnit", report: { revision: "seed-repair" } },
      {
        kind: "integrateWorkspace",
        report: { head: "seed-integration", status: "integrated" },
      },
    ],
  });
  expect(seen).toEqual({
    runWorkflow: [],
    repairUnit: ["unitRepair"],
    diagnose: ["unitRepair"],
    integrateWorkspace: ["workspaceIntegration"],
    verifyIntegration: [],
    checkSupport: [],
  });
});
