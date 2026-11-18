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

it("describes the typed workflows in the installed template domains", async () => {
  const base = fileURLToPath(new URL("../../..", import.meta.url));
  const templateRoot = join(base, "..");
  const workspaceRoots = [
    base,
    ...[
      "examples",
      "google-workspace",
      "news",
      "personal",
      "spectrolite",
      "system",
      "system-testing",
    ].map((name) => join(templateRoot, name)),
  ];
  async function resolve(path: string) {
    for (const root of workspaceRoots) {
      const candidate = join(root, path);
      try {
        return { candidate, info: await stat(candidate) };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    throw new Error(`Missing installed workspace path ${path}`);
  }

  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const validated = "The assigned callable accepted the fixture input";
  const stagedCalls: string[] = [];
  let runReference = false;
  const referenceSteps: Record<string, string> = {
    runWorkflow: `
      const system = request.work[1];
      const report = await domains.system.investigateSystem(system.input);
      const results = [{kind: "domain", domain: system.domain, operation: system.operation, report}];
      if (report.status !== "attention") return {results, remaining: ["No established regression"]};
      const next = request.work[0];
      results.push({kind: "domain", domain: next.domain, operation: next.operation,
        report: await domains.automation.prepareAutomation(next.input)});
      return {results, remaining: []};
    `,
    investigateSystem: "return await comparePerformance(request);",
    comparePerformance:
      "return await interpretComparison(await compare(input), [input.baseline.id, input.candidate.id]);",
    interpretComparison:
      'return {status: comparison.verdict === "regression" ? "attention" : "inconclusive", findings: [{code: comparison.verdict, evidenceIds: runIds}]};',
    prepareAutomation:
      "await classifyIntent(request.goal); return await draftLaunch(request);",
    classifyIntent: 'return "launch";',
    draftLaunch: `
      const executor = await chooseExecutor(request.goal);
      const reading = await readSchedule(request.goal);
      const trigger = await schedule.toTrigger(reading, {timezone: request.timezone, now: request.now});
      const conversation = await chooseConversation(request.goal, trigger);
      const operations = await declareOperations(request.goal, executor, request.availableOperations);
      const draft = {kind: "launch", executor, trigger, conversation, operations};
      await reviewLaunch(request, draft);
      return draft;
    `,
    chooseExecutor: 'return "notify";',
    readSchedule:
      'return {cadence:"interval",everyMinutes:45,hour:null,minute:null,weekdays:[],dayOfMonth:null,timezone:null,lastDay:null,forDays:null,maxRuns:null};',
    chooseConversation: 'return "continue";',
    declareOperations: "return [];",
    reviewLaunch: "return [];",
  };
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      if (!runReference) throw new Error(validated);
      const name = session.lam.functionName;
      const code = name && referenceSteps[name];
      if (!code) throw new Error(`No scripted reference for ${name}`);
      stagedCalls.push(name);
      const action = await session.applyAsync("eval", { code, finish: true });
      if (action.kind === "rejected") throw new Error(action.text);
    },
  });
  const loader = new ProgramLoader({
    platform,
    fs: {
      readFile: async (path) =>
        readFile((await resolve(path)).candidate, "utf8"),
      stat: async (path) => (await resolve(path)).info,
      readdir: async (path) => {
        if (path !== "skills")
          return readdir((await resolve(path)).candidate, {
            withFileTypes: true,
          });
        const roots = await Promise.all(
          workspaceRoots.map(async (root) => {
            try {
              return await readdir(join(root, "skills"), {
                withFileTypes: true,
              });
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT")
                throw error;
              return [];
            }
          }),
        );
        return [
          ...new Map(roots.flat().map((entry) => [entry.name, entry])).values(),
        ];
      },
    },
    bindings: {},
    runTask: (run, task) => runtime.run(run, task),
  });

  const description = await loader.describe(
    "skills/vibestudio-workflows/runWorkflow.nl",
  );
  const expected = new Map([
    [
      base,
      [
        "prepareAutomation",
        "preflightPublication",
        "reviewTemplate",
        "reviewProblem",
        "reviewProvenance",
        "reviewDeviceAndTerminal",
        "reviewResearchIntake",
        "reviewWorkspaceUnit",
        "reviewRuntimeEvidence",
        "reviewConversation",
        "reviewMediaAndImport",
      ],
    ],
    [join(templateRoot, "google-workspace"), ["guideGoogleWorkspace", "reviewGmailWorkflow"]],
    [
      join(templateRoot, "personal"),
      ["runPersonalWorkflow", "reviewPersonalFacility"],
    ],
    [join(templateRoot, "system"), ["investigateSystem"]],
    [join(templateRoot, "system-testing"), ["reviewSystemTest", "reviewSessionTest"]],
    [join(templateRoot, "examples"), ["reviewExample"]],
    [join(templateRoot, "news"), ["reviewNews"]],
    [join(templateRoot, "spectrolite"), ["reviewSpectrolite"]],
  ]);
  for (const [directory, names] of expected) {
    if (!(await stat(directory).catch(() => null))?.isDirectory()) continue;
    for (const name of names) {
      const definition = description.functions.find(
        (item) => item.name === name,
      );
      expect(definition, name).toBeDefined();
      expect(definition?.source).toMatch(/^runWorkflow\/domains\//u);
      expect(definition?.fields.map((field) => field.problem)).toEqual([
        undefined,
      ]);
      expect(definition?.result.problem).toBeUndefined();
    }
  }
  // The host writes this file from the authoritative cross-template catalog.
  // Run the real callable's input boundary and stop before model execution.
  const manifest = process.env["VIBESTUDIO_WORKFLOW_BANK_JSONL"];
  if (!manifest) return;
  const program = (await loader.load(
    "skills/vibestudio-workflows/runWorkflow.nl",
  )) as ((request: unknown) => Promise<unknown>) & {
    domains: Record<
      string,
      Record<string, (input: unknown) => Promise<unknown>>
    >;
  };
  const cases = (await readFile(manifest, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line)) as Array<{
    id: string;
    execution: string;
    request?: {
      work: {
        kind: string;
        domain: string;
        operation: string;
        input: unknown;
      }[];
    };
  }>;
  let checked = 0;
  for (const scenario of cases) {
    if (scenario.execution !== "scoped-fixture") continue;
    expect(scenario.request?.work.length, scenario.id).toBeGreaterThan(0);
    for (const item of scenario.request!.work) {
      expect(item.kind, scenario.id).toBe("domain");
      const callable = program.domains[item.domain]?.[item.operation];
      expect(typeof callable, scenario.id).toBe("function");
      await expect(callable!(item.input), scenario.id).rejects.toThrow(
        validated,
      );
      checked += 1;
    }
  }
  expect(checked).toBeGreaterThanOrEqual(
    cases.filter((scenario) => scenario.execution === "scoped-fixture").length,
  );
  // Exercise the actual mounted TS arithmetic and the shared-root branch under a scripted agent.
  const regression = cases.find(
    (scenario) => scenario.id === "combined-editor-latency-followup",
  );
  const incomparable = cases.find(
    (scenario) => scenario.id === "combined-cold-and-warm-samples-hold",
  );
  expect(regression?.request).toBeDefined();
  expect(incomparable?.request).toBeDefined();
  runReference = true;
  await expect(program(regression?.request)).resolves.toMatchObject({
    results: [
      { domain: "system", report: { status: "attention" } },
      {
        domain: "automation",
        report: { trigger: { kind: "schedule", everyMs: 2_700_000 } },
      },
    ],
    remaining: [],
  });
  expect(stagedCalls).toContain("interpretComparison");
  expect(stagedCalls.indexOf("investigateSystem")).toBeLessThan(
    stagedCalls.indexOf("prepareAutomation"),
  );
  stagedCalls.length = 0;
  await expect(program(incomparable?.request)).resolves.toMatchObject({
    results: [{ domain: "system", report: { status: "inconclusive" } }],
    remaining: ["No established regression"],
  });
  expect(stagedCalls).not.toContain("prepareAutomation");
}, 120_000);
