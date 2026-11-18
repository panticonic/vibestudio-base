import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { ProgramLoader } from "../../packages/natlang/src/programs.js";
import { confinedRealm } from "../../packages/natlang/src/realm.js";
import { testNewFunction } from "../../packages/natlang/src/testSupport.js";
import {
  createNatlangRuntime,
  workerdPlatform,
} from "../../packages/natlang/vendor/workerd/natlang-workerd.js";
import type { LifecycleReport } from "../automation-lifecycle/types.js";
import {
  createAutomationLifecycleFixture,
  verifyAutomationLifecycle,
} from "./fixture.js";
import { automationLifecycleWorlds } from "./worlds.js";

const reference: Record<string, string> = {
  runWorkflow: `
    const item = request.work[0];
    const report = await domains.automationLifecycle.reconcileAutomation(item.input);
    return {results:[{kind:"domain",domain:item.domain,operation:item.operation,report}],remaining:[]};
  `,
  reconcileAutomation: `
    const before = await observeMission(request.missionId);
    const decision = await assessTransition(request, before);
    const receipt = decision === "apply" ? await applyTransition(request) : null;
    const observed = decision === "apply" ? await observeMission(request.missionId) : before;
    return await confirmTransition(request, decision, observed, receipt);
  `,
  observeMission: "return await automationLifecycleRead.observe(missionId);",
  assessTransition: `
    if (!observation || observation.missionId !== request.missionId || observation.revisionDigest !== request.revisionDigest ||
      observation.state === "completed" || observation.state === "retired") return "held";
    return observation.state === (request.action === "pause" ? "paused" : "active") ? "unchanged" : "apply";
  `,
  applyTransition:
    "return await automationLifecycleChange.apply(request.missionId, request.revisionDigest, request.action);",
  confirmTransition: `
    const matches = observation && observation.missionId === request.missionId &&
      observation.revisionDigest === request.revisionDigest &&
      observation.state === (request.action === "pause" ? "paused" : "active");
    const status = receipt === "blocked" || decision === "held" ? "held" :
      decision === "unchanged" ? "unchanged" : !matches ? "uncertain" :
      receipt === "acknowledged" ? "applied" : receipt === "already" ? "unchanged" : "reconciled";
    return {missionId:request.missionId,status,state:observation?.state ?? null,revisionDigest:observation?.revisionDigest ?? null};
  `,
};

it("runs authored lifecycle cases through the shared root and checks actual mission operations", async () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const scopes: Record<string, string[]> = {
    observeMission: ["automationLifecycleRead"],
    applyTransition: ["automationLifecycleChange"],
  };
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      const name = session.lam.functionName ?? "";
      expect(Object.keys(session.availableServices())).toEqual(
        scopes[name] ?? [],
      );
      const code = reference[name];
      if (!code) throw new Error(`No reference for ${name}`);
      const action = await session.applyAsync("eval", { code, finish: true });
      if (action.kind === "rejected") throw new Error(action.text);
    },
  });
  const loader = new ProgramLoader({
    platform,
    bindings: {},
    fs: {
      readFile: (path) => readFile(join(root, path), "utf8"),
      readdir: (path) => readdir(join(root, path), { withFileTypes: true }),
      stat: (path) => stat(join(root, path)),
    },
    runTask: (run, task) => runtime.run(run, task),
  });
  for (const world of automationLifecycleWorlds) {
    const fixture = createAutomationLifecycleFixture(world);
    const program = (await loader.load(
      "skills/vibestudio-workflows/runWorkflow.nl",
      {
        services: fixture.bindings,
      },
    )) as (request: unknown) => Promise<{
      results: { report: LifecycleReport }[];
      remaining: string[];
    }>;
    const result = await program({
      goal: world.request.goal,
      work: [
        {
          kind: "domain",
          domain: "automationLifecycle",
          operation: "reconcileAutomation",
          input: world.request,
        },
      ],
    }).catch((error) => {
      throw new Error(`Scripted lifecycle run failed for ${world.id}`, {
        cause: error,
      });
    });
    expect(result.remaining).toEqual([]);
    expect(result.results).toHaveLength(1);
    const report = result.results[0]!.report;
    const journal = fixture.audit();
    expect(verifyAutomationLifecycle(world, report, journal), world.id).toBe(
      true,
    );
    expect(
      verifyAutomationLifecycle(
        world,
        { ...report, state: report.state === null ? "active" : null },
        journal,
      ),
    ).toBe(false);
  }
});

it("does not admit a different mission, action or revision and admits only one effect", async () => {
  const world = automationLifecycleWorlds.find(
    (world) => world.id === "automation-lifecycle-maintenance-window",
  )!;
  const fixture = createAutomationLifecycleFixture(world);
  const { automationLifecycleRead, automationLifecycleChange } =
    fixture.bindings;
  const { missionId, revisionDigest, action } = world.request;
  await expect(
    automationLifecycleRead.observe("other-mission"),
  ).rejects.toThrow("assigned");
  await expect(
    automationLifecycleChange.apply(missionId, revisionDigest, "resume"),
  ).resolves.toBe("blocked");
  await expect(
    automationLifecycleChange.apply(missionId, "other-revision", action),
  ).resolves.toBe("blocked");
  await automationLifecycleRead.observe(missionId);
  const results = await Promise.all([
    automationLifecycleChange.apply(missionId, revisionDigest, action),
    automationLifecycleChange.apply(missionId, revisionDigest, action),
  ]);
  expect(results).toEqual(["acknowledged", "blocked"]);
  expect(fixture.audit().map((row) => row.action)).toEqual([
    "get",
    "get",
    "pause",
  ]);
  expect(fixture.audit().at(-1)?.expectedRevisionDigest).toBe(revisionDigest);
});
