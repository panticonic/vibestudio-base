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

it("keeps the unpublished Git candidate attached through both mounted reviews", async () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const repository = "projects/review";
  const candidate = {
    contextId: "candidate-context",
    eventId: "workspace-event:candidate",
  };
  const view = {
    repository,
    upstream: {
      state: "integration-required",
      remote: "origin",
      branch: "main",
      autoPush: true,
      candidate,
      observation: null,
    },
    semantic: {
      contextId: "current-context",
      current: true,
      mainEventId: "workspace-event:main",
      working: { kind: "event", eventId: "workspace-event:main" },
      clean: true,
      relation: "at",
      workingRepositoryId: "repository:review",
      mainRepositoryId: "repository:review",
    },
  };
  const scripts: Record<string, string> = {
    runWorkflow: `
      const report=await domains.gitBridge.reviewGitBridge(request.work[0].input);
      return {results:[{kind:"domain",domain:"gitBridge",operation:"reviewGitBridge",report}],remaining:[]};
    `,
    reviewGitBridge: `
      const view=await gitBridgeReviewRead.observe(request.operationId);
      const upstreamReview=await reviewUpstream(request.direction,view.upstream);
      const semanticReview=await reviewSemantic(view.semantic,view.upstream.candidate);
      return {view,upstreamReview,semanticReview,...await chooseBridgeStep(request.direction,view,upstreamReview,semanticReview)};
    `,
    reviewUpstream: `
      const freshness=await checkFreshness(upstream);
      return {freshness,consequence:await interpretTransfer(direction,upstream,freshness)};
    `,
    checkFreshness: 'return upstream.observation?"observed":"failed";',
    interpretTransfer: 'return "Pending import "+upstream.candidate.eventId;',
    reviewSemantic: `
      return {source:await reviewPublicationBasis(semantic),integration:await reviewCandidate(candidate)};
    `,
    reviewPublicationBasis:
      'return {state:"protected",explanation:semantic.mainEventId};',
    reviewCandidate:
      'return {candidate,explanation:"Compare the unpublished event."};',
    chooseBridgeStep:
      'return {next:"compare-candidate",reason:semanticReview.integration.candidate.eventId};',
  };
  const stages: string[] = [];
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      const name = session.lam.functionName!;
      stages.push(name);
      expect(Object.keys(session.availableServices())).toEqual(
        name === "reviewGitBridge" ? ["gitBridgeReviewRead"] : [],
      );
      const code = scripts[name];
      if (!code) throw new Error("Unexpected Git Bridge stage " + name);
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
  const reads: string[] = [];
  const run = (await loader.load("skills/vibestudio-workflows/runWorkflow.nl", {
    services: {
      gitBridgeReviewRead: {
        observe(id: string) {
          reads.push(id);
          return Promise.resolve(view);
        },
      },
    },
  })) as (value: unknown) => Promise<unknown>;
  const input = {
    goal: "Determine whether to export the protected repository",
    operationId: "assigned-bridge",
    repository,
    direction: "export",
  };
  await expect(
    run({
      goal: input.goal,
      work: [
        {
          kind: "domain",
          domain: "gitBridge",
          operation: "reviewGitBridge",
          input,
        },
      ],
    }),
  ).resolves.toMatchObject({
    results: [
      {
        report: {
          view,
          upstreamReview: { freshness: "failed" },
          semanticReview: { integration: { candidate } },
          next: "compare-candidate",
          reason: candidate.eventId,
        },
      },
    ],
  });
  expect(reads).toEqual([input.operationId]);
  expect(stages).toEqual([
    "runWorkflow",
    "reviewGitBridge",
    "reviewUpstream",
    "checkFreshness",
    "interpretTransfer",
    "reviewSemantic",
    "reviewPublicationBasis",
    "reviewCandidate",
    "chooseBridgeStep",
  ]);
});
