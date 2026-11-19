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

it("reconstructs exact columns from the mounted PDF layout stages", async () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const page = {
    digest: "q".repeat(64),
    pageNumber: 1,
    width: 500,
    height: 200,
    rows: [
      [
        { text: "Left heading", bounds: [20, 20, 70, 12] },
        { text: "Right heading", bounds: [250, 20, 80, 12] },
      ],
      [
        { text: "Left details", bounds: [20, 40, 65, 12] },
        { text: "Right details", bounds: [250, 40, 75, 12] },
      ],
    ],
  };
  const scripts: Record<string, string> = {
    runWorkflow: `
      const report=await domains.pdfIntake.reviewPdfLayout(request.work[0].input);
      return {results:[{kind:"domain",domain:"pdfIntake",operation:"reviewPdfLayout",report}],remaining:[]};
    `,
    reviewPdfLayout: `
      const page=await pdfLayoutRead.inspect(request.operationId);
      const layout=await inspectLayout(page,request.goal);
      return {digest:page.digest,pageNumber:page.pageNumber,layout,reading:await resolveReadingOrder(page,layout)};
    `,
    inspectLayout:
      "return await classifyLayout(await describeGeometry(page),goal);",
    describeGeometry:
      'return "Parallel starts at "+page.rows[0].map(part=>part.bounds[0]).join(" and ");',
    classifyLayout: 'return {kind:"columns",basis:geometry};',
    resolveReadingOrder:
      "return await citeLayout.resolveOrder(page,await arrangeFragments(page,layout));",
    arrangeFragments:
      "return [0,1].flatMap(fragment=>[0,1].map(row=>({row,fragment})));",
  };
  const stages: string[] = [];
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      const name = session.lam.functionName!;
      stages.push(name);
      expect(Object.keys(session.availableServices())).toEqual(
        name === "reviewPdfLayout" ? ["pdfLayoutRead"] : [],
      );
      const code = scripts[name];
      if (!code) throw new Error("Unexpected layout stage " + name);
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
      pdfLayoutRead: {
        async inspect(id: string) {
          reads.push(id);
          return page;
        },
      },
    },
  })) as (value: unknown) => Promise<unknown>;
  const input = {
    goal: "Read the narrative columns",
    operationId: "assigned-pdf-page",
  };
  await expect(
    run({
      goal: input.goal,
      work: [
        {
          kind: "domain",
          domain: "pdfIntake",
          operation: "reviewPdfLayout",
          input,
        },
      ],
    }),
  ).resolves.toMatchObject({
    results: [
      {
        report: {
          digest: page.digest,
          pageNumber: 1,
          layout: { kind: "columns" },
          reading: {
            status: "ordered",
            entries: [
              { row: 0, fragment: 0, ...page.rows[0]![0] },
              { row: 1, fragment: 0, ...page.rows[1]![0] },
              { row: 0, fragment: 1, ...page.rows[0]![1] },
              { row: 1, fragment: 1, ...page.rows[1]![1] },
            ],
          },
        },
      },
    ],
  });
  expect(reads).toEqual([input.operationId]);
  expect(stages).toEqual([
    "runWorkflow",
    "reviewPdfLayout",
    "inspectLayout",
    "describeGeometry",
    "classifyLayout",
    "resolveReadingOrder",
    "arrangeFragments",
  ]);
});
