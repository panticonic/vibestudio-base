import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProgramLoader } from "../../packages/natlang/src/programs.js";
import { confinedRealm } from "../../packages/natlang/src/realm.js";
import { testNewFunction } from "../../packages/natlang/src/testSupport.js";
import {
  createNatlangRuntime,
  workerdPlatform,
} from "../../packages/natlang/vendor/workerd/natlang-workerd.js";
import { afterEach, expect, it, vi } from "vitest";

const resolveCredential = vi.hoisted(() => vi.fn());
vi.mock("@workspace/runtime", () => ({ credentials: { resolveCredential } }));
import { bindIntegrationReview } from "./workflow.js";

const first = {
  id: "read",
  url: "https://read.example.invalid/items",
  purpose: "Read assigned records",
  use: "fetch" as const,
  required: true,
};
const second = {
  id: "publish",
  url: "https://publish.example.invalid/items",
  purpose: "Publish the report",
  use: "publish" as const,
  required: false,
};
afterEach(() => resolveCredential.mockReset());

it("resolves sealed coordinates in order and projects only permitted lifecycle fields", async () => {
  const assigned = { ...first };
  const { request, services } = bindIntegrationReview({
    goal: "Check access",
    destinations: [assigned, second],
  });
  assigned.url = "https://wrong.example.invalid/";
  await expect(services.integrationPlanRead.observe("wrong")).rejects.toThrow(
    /assigned/,
  );
  const plan = await services.integrationPlanRead.observe(request.operationId);
  expect(plan.destinations).toEqual([
    { id: first.id, purpose: first.purpose, use: "fetch", required: true },
    { id: second.id, purpose: second.purpose, use: "publish", required: false },
  ]);
  await expect(
    services.integrationCredentialLookup.resolve(plan.receipt, second.id),
  ).rejects.toThrow(/next destination/);
  resolveCredential.mockResolvedValueOnce(null).mockResolvedValueOnce({
    id: "private-id",
    scopes: ["sensitive-scope"],
    metadata: { arbitrary: "private" },
    lifecycle: { state: "active", canRefresh: true },
  });
  expect(
    await services.integrationCredentialLookup.resolve(plan.receipt, first.id),
  ).toEqual({
    id: first.id,
    receipt: request.operationId + ":binding:" + first.id,
    state: "missing",
    canRefresh: null,
  });
  expect(
    await services.integrationCredentialLookup.resolve(plan.receipt, second.id),
  ).toEqual({
    id: second.id,
    receipt: request.operationId + ":binding:" + second.id,
    state: "active",
    canRefresh: true,
  });
  expect(resolveCredential).toHaveBeenNthCalledWith(1, {
    url: first.url,
    use: first.use,
  });
  expect(resolveCredential).toHaveBeenNthCalledWith(2, {
    url: second.url,
    use: second.use,
  });
});

it("withholds a non-null failure and prevents continued lookup after it", async () => {
  const failure = new Error("Caller-private transport error");
  const { request, services, lookupFailure } = bindIntegrationReview({
    goal: "Check access",
    destinations: [first, second],
  });
  const plan = await services.integrationPlanRead.observe(request.operationId);
  resolveCredential.mockRejectedValueOnce(failure);
  expect(
    await services.integrationCredentialLookup.resolve(plan.receipt, first.id),
  ).toEqual({
    id: first.id,
    receipt: request.operationId + ":binding:" + first.id,
    state: "unverified",
    canRefresh: null,
  });
  expect(lookupFailure()).toBe(failure);
  await expect(
    services.integrationCredentialLookup.resolve(plan.receipt, second.id),
  ).rejects.toThrow(/next destination/);
  expect(resolveCredential).toHaveBeenCalledTimes(1);
});

it("executes the mounted readiness tree for optional gaps and authorization holds", async () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const commands: Record<string, string> = {
    runWorkflow: `
      const item=request.work[0];
      const report=await domains.apiIntegration.reviewIntegration(item.input);
      return {results:[{kind:"domain",domain:item.domain,operation:item.operation,report}],remaining:[]};
    `,
    reviewIntegration: `
      const plan=await readIntegrationPlan(request.operationId);
      const destinations=[];
      for (const {id} of plan.destinations) {
        const review=await reviewAudience(plan.receipt,id);
        destinations.push(review);
        if (review.observation.state==="unverified") break;
      }
      const coverage=await summarizeCoverage(request.goal,plan.destinations,destinations);
      return {...coverage,planReceipt:plan.receipt,destinations,held:plan.destinations.slice(destinations.length).map(x=>x.id)};
    `,
    readIntegrationPlan:
      "return await integrationPlanRead.observe(operationId);",
    reviewAudience: `
      const observation=await resolveBinding(planReceipt,destinationId);
      return {observation,disposition:await interpretBinding(observation)};
    `,
    resolveBinding:
      "return await integrationCredentialLookup.resolve(planReceipt,destinationId);",
    interpretBinding: `
      return {active:"ready",missing:"setup-needed",expired:"renewal-needed",revoked:"renewal-needed",unverified:"authorization-unverified"}[observation.state];
    `,
    summarizeCoverage: `
      const required=destinations.filter(item=>item.required).map(
        item=>reviews.find(row=>row.observation.id===item.id)?.disposition??"authorization-unverified");
      const status=["authorization-unverified","setup-needed","renewal-needed"].find(state=>required.includes(state))??"ready";
      return {status,guidance:null};
    `,
  };
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      const code = commands[session.lam.functionName!];
      if (!code) throw new Error("Unexpected readiness stage");
      const result = await session.applyAsync("eval", { code, finish: true });
      if (result.kind === "rejected") throw new Error(result.text);
    },
  });
  const loader = new ProgramLoader({
    platform,
    fs: {
      readFile: (name) => readFile(join(root, name), "utf8"),
      readdir: (name) => readdir(join(root, name), { withFileTypes: true }),
      stat: (name) => stat(join(root, name)),
    },
    bindings: {},
    runTask: (run, task) => runtime.run(run, task),
  });
  async function review() {
    const binding = bindIntegrationReview({
      goal: "Assess the integration",
      destinations: [first, second],
    });
    const run = (await loader.load(
      "skills/vibestudio-workflows/runWorkflow.nl",
      { services: binding.services },
    )) as (request: unknown) => Promise<unknown>;
    return run({
      goal: binding.request.goal,
      work: [
        {
          kind: "domain",
          domain: "apiIntegration",
          operation: "reviewIntegration",
          input: binding.request,
        },
      ],
    });
  }
  resolveCredential
    .mockResolvedValueOnce({ lifecycle: { state: "active", canRefresh: true } })
    .mockResolvedValueOnce(null);
  await expect(review()).resolves.toMatchObject({
    results: [
      {
        report: {
          status: "ready",
          held: [],
          destinations: [
            { disposition: "ready" },
            { disposition: "setup-needed" },
          ],
        },
      },
    ],
  });
  resolveCredential.mockRejectedValueOnce(
    new Error("Authorization is unavailable"),
  );
  await expect(review()).resolves.toMatchObject({
    results: [
      {
        report: {
          status: "authorization-unverified",
          held: ["publish"],
          destinations: [{ disposition: "authorization-unverified" }],
        },
      },
    ],
  });
  expect(resolveCredential).toHaveBeenCalledTimes(3);
});
