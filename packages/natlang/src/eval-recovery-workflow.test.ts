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

it("confirms a completed effect after a failed eval through the mounted recovery program", async () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const attempt = {
    operationId: "owned-eval-attempt",
    runId: "eval:failed",
    cell: "failed",
    journal: "complete",
    expectedDigest: "d".repeat(64),
    expectedSize: 12,
    allowReadback: true,
    stores: [
      { digest: "d".repeat(64), contentDigest: "d".repeat(64), size: 12 },
    ],
  };
  const readback = {
    digest: attempt.expectedDigest,
    observedDigest: attempt.expectedDigest,
    size: 12,
  };
  const scripts: Record<string, string> = {
    runWorkflow: `
      const report=await domains.evalRecovery.reviewEvalRecovery(request.work[0].input);
      return {results:[{kind:"domain",domain:"evalRecovery",operation:"reviewEvalRecovery",report}],remaining:[]};
    `,
    reviewEvalRecovery: `
      const attempt=await evalRecoveryJournal.observe(request.operationId);
      const journal=await inspectJournal(attempt);
      const observed=await verifyEffect(attempt,journal);
      return {runId:attempt.runId,cell:attempt.cell,journal,...observed,...await chooseRecovery(attempt,journal,observed.effect)};
    `,
    inspectJournal: "return await compareReceipts(attempt);",
    compareReceipts:
      'return attempt.stores.length===1&&attempt.stores[0].digest===attempt.expectedDigest?"matched":"absent";',
    verifyEffect: `
      const readback=await evalRecoveryReadback.read(attempt.operationId,attempt.expectedDigest);
      return {readback,effect:await assessReadback(attempt,readback)};
    `,
    assessReadback:
      'return read.observedDigest===attempt.expectedDigest&&read.size===attempt.expectedSize?"confirmed":"different";',
    chooseRecovery:
      'return {next:effect==="confirmed"?"continue-with-effect":"confirm-effect",reason:"Recorded effect survives the cell failure."};',
  };
  const stages: string[] = [];
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      const name = session.lam.functionName!;
      stages.push(name);
      expect(Object.keys(session.availableServices())).toEqual(
        name === "reviewEvalRecovery"
          ? ["evalRecoveryJournal"]
          : name === "verifyEffect"
            ? ["evalRecoveryReadback"]
            : [],
      );
      const code = scripts[name];
      if (!code) throw new Error("Unexpected recovery stage " + name);
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
      evalRecoveryJournal: {
        async observe(id: string) {
          reads.push(id);
          return attempt;
        },
      },
      evalRecoveryReadback: {
        async read(id: string, digest: string) {
          reads.push([id, digest]);
          return readback;
        },
      },
    },
  })) as (value: unknown) => Promise<unknown>;
  const input = {
    goal: "Recover the assigned write",
    operationId: attempt.operationId,
  };
  await expect(
    run({
      goal: input.goal,
      work: [
        {
          kind: "domain",
          domain: "evalRecovery",
          operation: "reviewEvalRecovery",
          input,
        },
      ],
    }),
  ).resolves.toMatchObject({
    results: [
      {
        report: {
          runId: attempt.runId,
          cell: "failed",
          journal: "matched",
          effect: "confirmed",
          next: "continue-with-effect",
          readback,
        },
      },
    ],
  });
  expect(reads).toEqual([
    attempt.operationId,
    [attempt.operationId, attempt.expectedDigest],
  ]);
  expect(stages).toEqual([
    "runWorkflow",
    "reviewEvalRecovery",
    "inspectJournal",
    "compareReceipts",
    "verifyEffect",
    "assessReadback",
    "chooseRecovery",
  ]);
});
