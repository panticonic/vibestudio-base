import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { activate } from "../../extensions/pdf-ingest/index.js";
import { makePdf } from "../../extensions/pdf-ingest/pdf/testPdf.js";
import { ProgramLoader } from "../../packages/natlang/src/programs.js";
import { confinedRealm } from "../../packages/natlang/src/realm.js";
import { testNewFunction } from "../../packages/natlang/src/testSupport.js";
import {
  createNatlangRuntime,
  workerdPlatform,
} from "../../packages/natlang/vendor/workerd/natlang-workerd.js";
import { createPdfIntakeBindings } from "../pdf-intake-bindings/index.js";
import type { PdfIntakeReport, PdfIntakeRequest } from "../pdf-intake/types.js";
import { createPdfIntakeFixture } from "./fixture.js";
import { verifyPdfIntake } from "./oracle.js";
import { pdfIntakeWorlds } from "./worlds.js";

const reference: Record<string, string> = {
  extractPdfEvidence: `
    const probe = await probeDocument(request.document);
    const plan = await choosePlan(request, probe);
    const digest = probe.digest;
    if (plan !== "embedded" && plan !== "local-fallback" && plan !== "local-ocr") {
      return {status: plan, digest, readPages: [], remaining: request.pages, citations: [], unanswered: [request.query]};
    }
    const pages = [];
    const readPages = [];
    for (const batch of await intakeChecks.batches(request.pages, request.batchSize)) {
      try {
        const receipt = await readBatch(request.document, batch, plan);
        if (!await intakeChecks.matchesBatch(digest, batch, receipt)) break;
        pages.push(...receipt.pages);
        readPages.push(...batch);
      } catch {
        break;
      }
    }
    const {locations, unanswered} = await findEvidence(request, pages);
    const citations = await intakeChecks.citations(pages, locations);
    const remaining = request.pages.slice(readPages.length);
    const status = remaining.length ? "incomplete" : !citations.length ? "no-match" : unanswered.length ? "partial-match" : "verified";
    return {status, digest, readPages, remaining, citations, unanswered};
  `,
  probeDocument: "return await pdfIntakeProbe.probe(document);",
  choosePlan: `
    if (probe.encrypted) return "encrypted";
    if (!await intakeChecks.completeSelection(request.pages, probe)) return "missing-pages";
    if (!probe.embedded) return "engine-unavailable";
    const canOcr = request.allowOcr && probe.localOcr;
    if (request.purpose === "ocr") return canOcr ? "local-ocr" : "engine-unavailable";
    return request.purpose === "layout" && canOcr ? "local-fallback" : "embedded";
  `,
  readBatch: "return await pdfIntakeRead.read(document, pages, mode);",
  findEvidence: `
    const locations = [];
    const unanswered = [];
    for (const phrase of request.query.split(";").map(value => value.trim())) {
      const match = pages.flatMap(page => page.lines.flatMap((line, index) =>
        line.text.includes(phrase) ? [{page: page.number, line: index}] : [],
      ))[0];
      if (match) locations.push(match);
      else unanswered.push(phrase);
    }
    return {locations, unanswered};
  `,
};

function loader() {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      const name = session.lam.functionName ?? "";
      const expected =
        name === "probeDocument"
          ? ["pdfIntakeProbe"]
          : name === "readBatch"
            ? ["pdfIntakeRead"]
            : [];
      expect(Object.keys(session.availableServices()), name).toEqual(expected);
      const code = reference[name];
      if (!code) throw new Error(`No scripted reference for ${name}`);
      const action = await session.applyAsync("eval", { code, finish: true });
      if (action.kind === "rejected") throw new Error(action.text);
    },
  });
  return new ProgramLoader({
    platform,
    bindings: {},
    fs: {
      readFile: (path) => readFile(join(root, path), "utf8"),
      readdir: (path) => readdir(join(root, path), { withFileTypes: true }),
      stat: (path) => stat(join(root, path)),
    },
    runTask: (run, task) => runtime.run(run, task),
  });
}

it("executes each authored PDF task and checks citations against independent receipts", async () => {
  const runtime = loader();
  for (const world of pdfIntakeWorlds) {
    const fixture = createPdfIntakeFixture(world);
    const program = (await runtime.load(
      "skills/pdf-intake/extractPdfEvidence.nl",
      {
        services: fixture.bindings,
      },
    )) as (request: PdfIntakeRequest) => Promise<PdfIntakeReport>;
    const report = await program(world.request);
    const calls = fixture.operations();
    expect(
      verifyPdfIntake(world, report, calls),
      JSON.stringify({ id: world.id, report, calls }),
    ).toBe(true);
    expect(
      verifyPdfIntake(world, { ...report, digest: "unrelated" }, calls),
    ).toBe(false);
  }
});

it("probes and cites a real PDF through the existing extension and the native call tree", async () => {
  const failIfStored = async () => {
    throw new Error("Embedded extraction does not need artifact storage.");
  };
  const extension = await activate({
    storage: {
      mkdir: failIfStored,
      readFile: failIfStored,
      writeFile: failIfStored,
    },
    log: { info() {} },
    health: { healthy() {}, degraded() {} },
  });
  const bytes = makePdf([
    "BT",
    "/F1 12 Tf",
    "36 150 Td (Loading bay width 3400 mm) Tj",
    "ET",
  ]);
  const request: PdfIntakeRequest = {
    goal: "Find the original loading bay limit on the drawing",
    document: "assigned-local-drawing",
    pages: [1],
    batchSize: 1,
    purpose: "layout",
    allowOcr: false,
    query: "Loading bay width",
  };
  const bindings = createPdfIntakeBindings(extension, request, bytes);
  const program = (await loader().load(
    "skills/pdf-intake/extractPdfEvidence.nl",
    {
      services: bindings,
    },
  )) as (request: PdfIntakeRequest) => Promise<PdfIntakeReport>;
  const baseline = await extension.probe(bytes, { pages: [1] });
  const result = await program(request);
  expect(result).toMatchObject({
    status: "verified",
    digest: baseline.document.digest,
    readPages: [1],
    remaining: [],
    citations: [
      {
        page: 1,
        line: 0,
        quote: "Loading bay width 3400 mm",
        source: "embedded-text",
      },
    ],
  });
  expect(result.citations[0]?.bounds).toHaveLength(4);
  await expect(
    bindings.pdfIntakeProbe.probe("different-document"),
  ).rejects.toThrow("assigned PDF reference");
  await expect(
    bindings.pdfIntakeRead.read(request.document, [1], "embedded"),
  ).rejects.toThrow("next assigned");
});
