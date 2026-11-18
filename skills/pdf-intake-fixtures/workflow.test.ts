import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { activate } from "../../extensions/pdf-ingest/index.js";
import { makePdf } from "../../extensions/pdf-ingest/pdf/testPdf.js";
import { ProgramLoader } from "../../packages/natlang/src/programs.js";
import { confinedRealm } from "../../packages/natlang/src/realm.js";
import { RecordsStore } from "../../packages/natlang/src/recordsStore.js";
import { testNewFunction } from "../../packages/natlang/src/testSupport.js";
import {
  createNatlangRuntime,
  currentFrame,
  workerdPlatform,
} from "../../packages/natlang/vendor/workerd/natlang-workerd.js";
import { createPdfIntakeBindings } from "../pdf-intake-bindings/index.js";
import type { PdfIntakeReport, PdfIntakeRequest } from "../pdf-intake/types.js";
import { createScratchHandoffFixture } from "../scratch-handoff-fixtures/fixture.js";
import { scratchHandoffWorlds } from "../scratch-handoff-fixtures/worlds.js";
import type {
  HandoffReport,
  HandoffRequest,
} from "../scratch-handoff/types.js";
import { createTemplateCandidateFixture } from "../template-candidate-fixtures/fixture.js";
import { templateCandidateWorlds } from "../template-candidate-fixtures/worlds.js";
import { presentationWorlds } from "../visualization-fixtures/worlds.js";
import type {
  CandidateReport,
  CandidateRequest,
} from "../template-candidate/types.js";
import { createPdfIntakeFixture } from "./fixture.js";
import { verifyPdfIntake } from "./oracle.js";
import { pdfIntakeWorlds } from "./worlds.js";

const reference: Record<string, string> = {
  runWorkflow: `
    const selected = request.work[0];
    let report;
    if (selected.domain === "google") report = await domains.google.guideGoogleWorkspace(selected.input);
    else if (selected.domain === "publication") report = await domains.publication.preflightPublication(selected.input);
    else if (selected.domain === "localModel") report = await domains.localModel.prepareLocalModel(selected.input);
    else if (selected.domain === "scratchHandoff") report = await domains.scratchHandoff.assembleHandoff(selected.input);
    else if (selected.domain === "templateCandidate") report = await domains.templateCandidate.stageTemplateCandidate(selected.input);
    else if (selected.domain === "visualize") report = await domains.visualize.preparePresentation(selected.input);
    else report = await domains.pdfIntake.extractPdfEvidence(selected.input);
    return {results:[{kind:"domain",domain:selected.domain,operation:selected.operation,report}],remaining:[]};
  `,
  planPresentation: `return ${JSON.stringify(
    Object.fromEntries(
      presentationWorlds.map(({ request, expected }) => [
        request.goal,
        expected.map(({ id }) => id),
      ]),
    ),
  )}[request.goal];`,
  preparePresentation: `
    const order = await planPresentation(request);
    const views = [];
    for (const id of order) views.push(await prepareSection(request.sections.find(section => section.id === id)));
    return {views, omitted:request.sections.filter(section => !order.includes(section.id)).map(section => section.id)};
  `,
  prepareSection: `
    const component = await chooseComponent(section.data, section.ask);
    const id = section.id;
    if (component === "Prose") return {id, status:"plain"};
    if (["Calculator", "Diagram", "OneOff"].includes(component)) return {id, status:"deferred", component};
    const availability = await checkAvailability(section, component);
    if (availability.status === "rejected") return {id, status:"needs-review", reason:availability.reason};
    const spec = await readProps(section.data, component, section.ask);
    const readback = await checkReadback(section, component, spec);
    if (readback.status === "rejected") return {id, status:"needs-review", reason:readback.reason};
    return {id, status:"ready", rendered:await render.renderComponent(spec)};
  `,
  chooseComponent: `return ${JSON.stringify(
    Object.fromEntries(
      presentationWorlds.flatMap(({ request, expected }) =>
        expected.map(({ id, outcome }) => [
          request.sections.find((section) => section.id === id)!.data,
          outcome.status === "ready"
            ? outcome.spec.component
            : outcome.status === "plain"
              ? "Prose"
              : outcome.component,
        ]),
      ),
    ),
  )}[data];`,
  checkAvailability: `return section.id === "staffing" ? {status:"rejected", reason:"No staffing capacity was confirmed."} : {status:"accepted"};`,
  readProps: `return ${JSON.stringify(
    Object.fromEntries(
      presentationWorlds.flatMap(({ request, expected }) =>
        expected.flatMap(({ id, outcome }) =>
          outcome.status === "ready"
            ? [
                [
                  request.sections.find((section) => section.id === id)!.data,
                  outcome.spec,
                ],
              ]
            : [],
        ),
      ),
    ),
  )}[data];`,
  checkReadback:
    "return selected === spec.component ? {status:'accepted'} : {status:'rejected',reason:'The component changed.'};",
  guideGoogleWorkspace: `
    const readiness = await googleWorkspaceRead.readiness();
    if (readiness.state !== "ready") throw new Error("Inventory fixture Drive is unavailable");
    return await inspectFolder(request);
  `,
  inspectFolder: `
    const first = await googleWorkspaceRead.listFolder(request.folderId, null);
    const next = await googleWorkspaceRead.listFolder(request.folderId, first.next);
    const eligible = await eligibleRows(request, first.rows.concat(next.rows));
    const ids = await selectRows(request, eligible);
    return {status:"complete", ids, checkpoint:null, action:"none", findings:[String(ids.length) + " matching files"]};
  `,
  selectRows: "return rows.map(row => row.id);",
  preflightPublication: `
    const observed = await websiteReadback.observe();
    const artifact = await reviewArtifact(observed.artifact);
    const panel = await reviewPresentation(request, observed.presentation);
    const previous = await reviewPublication(request, observed.publication);
    const blockers = artifact.blockers.concat(panel.blockers, previous.blockers);
    return {status:"ready-for-review", blockers, evidence:artifact.evidence.concat(panel.evidence,previous.evidence),
      visual:await chooseReviewVisual(request, blockers, observed.publication)};
  `,
  reviewArtifact: "return await checkPublicFiles(artifact);",
  checkPublicFiles: "return {blockers:[], evidence:[artifact.artifactDigest]};",
  reviewPresentation:
    "return await assessPublicLabels(request.audience, presentation);",
  assessPublicLabels:
    "return {blockers:[], evidence:presentation.observedProbes};",
  reviewPublication:
    "return {blockers:[], evidence:[request.intendedDestination.destination]};",
  chooseReviewVisual:
    'return request.goal.toLowerCase().includes("checklist") ? "Checklist" : "Prose";',
  prepareLocalModel: `
    const initial = await inspectSelected(request.modelRef);
    const plan = await decideInstallation(request, initial);
    if (plan !== "install") throw new Error("Expected an authorized fixture install");
    const receipt = await applyInstallation(request.modelRef);
    const checked = await readOutcome(request.modelRef, receipt);
    return {ref:request.modelRef,state:checked.row.state,disposition:checked.disposition,receipt,handoff:null};
  `,
  inspectSelected: `
    const row = await localModelTaskInventory.inspect(ref);
    return {row,disposition:await interpretState(row)};
  `,
  interpretState:
    'return row.state === "not-installed" ? "needs-install" : "usable";',
  decideInstallation:
    'return initial.disposition === "needs-install" && request.mayInstall ? "install" : "skip";',
  applyInstallation: "return await localModelTaskInstall.installOnce(ref);",
  readOutcome: `
    const row = await localModelTaskInventory.inspect(ref);
    const observed = await interpretState(row);
    return {row,disposition:await resolveOutcome(observed, receipt)};
  `,
  resolveOutcome: "return observed;",
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
  stageTemplateCandidate: `
    const {decision, offer} = await inspectOffer(request);
    if (decision !== "prepare") return {status:decision,offer,operationId:null,candidate:null};
    const receipt = await prepareCandidate();
    if (receipt.outcome === "offer-changed") return {status:"offer-changed",offer,operationId:null,candidate:null};
    const result = await reconcileCandidate(request, receipt);
    return {status:result.status,offer,operationId:request.commandId,candidate:result.candidate};
  `,
  inspectOffer: `
    const offer = await readOffer();
    return {offer,decision:await assessOffer(request, offer)};
  `,
  readOffer: "return await templateOffer.read();",
  assessOffer: `
    if (offer === null) return "discover";
    if (offer.checkedAt < request.checkedAfterMs) return "refresh";
    if (offer.installedCommit !== request.installedCommit) return "target-changed";
    if (offer.status === "error") return "discovery-error";
    if (offer.incomingCommit !== request.incomingCommit) return "target-changed";
    if (offer.status === "current") return "current";
    if (offer.hostUnavailable) return "matching-host-required";
    if (offer.status === "requires-app-update") return "app-update-required";
    if (offer.status === "different-epoch") return "epoch-review-required";
    return request.intent === "stage" ? "prepare" : "available";
  `,
  prepareCandidate: "return await requestPreparation();",
  requestPreparation: "return await templateCandidatePrepare.prepare();",
  reconcileCandidate: `
    const checked = await candidateIdentity.verify(request, receipt, await readCandidate());
    if (checked.state !== "verified") return {status:checked.state,candidate:null};
    return {status:await chooseReview(checked.candidate),candidate:checked.candidate};
  `,
  readCandidate: "return await templateCandidateReview.read();",
  chooseReview: `
    if (candidate.state === "published") return "already-published";
    if (candidate.conflicts.length) return "resolve-conflicts";
    return "validate-candidate";
  `,
  assembleHandoff: `
    const {observed, missing} = await inspectSources(request.sources);
    if (missing.length) return {status:"source-unavailable",artifact:null,missingSources:missing,unanswered:[]};
    const prepared = await prepareHandoff(request, observed);
    if (prepared.body === null) return {status:"unanswered",artifact:null,missingSources:[],unanswered:prepared.unanswered};
    return await deliverHandoff(prepared.body);
  `,
  inspectSources: `
    const observed = [];
    const missing = [];
    for (const source of sources) {
      const snapshot = await readSource(source.id);
      if (snapshot === null) missing.push(source.id);
      else observed.push(snapshot);
    }
    return {observed,missing};
  `,
  readSource: "return await scratchHandoffRead.read(id);",
  prepareHandoff:
    "return await handoffChecks.prepare(request.questions, observed, await selectEvidence(request, observed));",
  selectEvidence: `return ${JSON.stringify(
    Object.fromEntries(
      scratchHandoffWorlds.map((world) => [
        world.request.goal,
        world.selection,
      ]),
    ),
  )}[request.goal];`,
  deliverHandoff: `
    const artifact = await commitHandoff(body);
    return {status:artifact === null ? "unverified" : "staged",artifact,missingSources:[],unanswered:[]};
  `,
  commitHandoff: "return await scratchHandoffWrite.stage(body);",
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

const serviceScopes: Record<string, string[]> = {
  readOffer: ["templateOffer"],
  requestPreparation: ["templateCandidatePrepare"],
  readCandidate: ["templateCandidateReview"],
  readSource: ["scratchHandoffRead"],
  commitHandoff: ["scratchHandoffWrite"],
  probeDocument: ["pdfIntakeProbe"],
  readBatch: ["pdfIntakeRead"],
  guideGoogleWorkspace: ["googleWorkspaceRead"],
  inspectFolder: ["googleWorkspaceRead"],
  preflightPublication: ["websiteReadback"],
  inspectSelected: ["localModelTaskInventory"],
  readOutcome: ["localModelTaskInventory"],
  applyInstallation: ["localModelTaskInstall"],
};

function loader(store?: RecordsStore, workspaceCheckouts: string[] = []) {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const roots = [root, ...workspaceCheckouts];
  async function locate(relative: string) {
    for (const directory of roots) {
      const filename = join(directory, relative);
      try {
        return { filename, info: await stat(filename) };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    throw new Error(`Not found in the configured templates: ${relative}`);
  }
  const platform = workerdPlatform({
    realm: confinedRealm(testNewFunction()),
    ...(store ? { callStore: () => store } : {}),
  });
  const runtime = createNatlangRuntime({
    platform,
    ...(store ? { calls: store } : {}),
    agent: async (session) => {
      const name = session.lam.functionName ?? "";
      expect(Object.keys(session.availableServices()), name).toEqual(
        serviceScopes[name] ?? [],
      );
      const code = reference[name];
      if (!code) throw new Error(`No scripted reference for ${name}`);
      const action = await session.applyAsync("eval", { code, finish: true });
      if (action.kind === "rejected" || action.kind === "error")
        throw new Error(`${name}: ${action.text}`);
    },
  });
  return new ProgramLoader({
    platform,
    bindings: {},
    fs: {
      readFile: async (path) => readFile((await locate(path)).filename, "utf8"),
      readdir: async (path) => {
        if (path !== "skills")
          return readdir((await locate(path)).filename, {
            withFileTypes: true,
          });
        const entries = (
          await Promise.all(
            roots.map(async (directory) => {
              try {
                return await readdir(join(directory, path), {
                  withFileTypes: true,
                });
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT")
                  throw error;
                return [];
              }
            }),
          )
        ).flat();
        return [
          ...new Map(entries.map((entry) => [entry.name, entry])).values(),
        ];
      },
      stat: async (path) => (await locate(path)).info,
    },
    runTask: async (run, task) => {
      const value = await runtime.run(() => {
        const frame = currentFrame();
        if (store && frame && task.programRoot)
          store.programRoots.set(frame.task.id, task.programRoot);
        return run();
      }, task);
      await store?.flush();
      return value;
    },
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

it("stages or holds every authored scratch handoff through the scoped Workerd call tree", async () => {
  const runtime = loader();
  for (const world of scratchHandoffWorlds) {
    const fixture = createScratchHandoffFixture(world);
    const workflow = (await runtime.load(
      "skills/scratch-handoff/assembleHandoff.nl",
      {
        services: fixture.bindings,
      },
    )) as (request: HandoffRequest) => Promise<HandoffReport>;
    const report = await workflow(world.request);
    expect(
      fixture.verify(report),
      JSON.stringify({ id: world.id, report }),
    ).toBe(true);
    if (report.artifact) {
      expect(
        fixture.verify({
          ...report,
          artifact: { ...report.artifact, bytes: 0 },
        }),
      ).toBe(false);
    }
  }
});

it("prepares or holds each template candidate using the exact native operation and readback", async () => {
  const runtime = loader();
  for (const world of templateCandidateWorlds) {
    const fixture = createTemplateCandidateFixture(world);
    const workflow = (await runtime.load(
      "skills/template-candidate/stageTemplateCandidate.nl",
      {
        services: fixture.bindings,
      },
    )) as (request: CandidateRequest) => Promise<CandidateReport>;
    const report = await workflow(world.request);
    expect(
      fixture.verify(report),
      JSON.stringify({ id: world.id, report }),
    ).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(
      /private-binding-credential|private upstream diagnostic/u,
    );
  }
});

const host = process.env["VIBESTUDIO_SCOPED_WORKFLOW_HOST"];
it.runIf(Boolean(host))(
  "grades actual Workerd runs across template domains from retained inputs and outputs",
  async () => {
    const runId = "scoped-pdf-workerd-test";
    type WriteRecord = Parameters<
      ConstructorParameters<typeof RecordsStore>[0]["record"]
    >[0];
    const rows = new Map<string, WriteRecord["record"]>();
    const recordClient = {
      async begin() {},
      async progress() {},
      async record(input: WriteRecord) {
        rows.set(input.record.call_id, input.record);
        return { recordId: input.record.call_id };
      },
    } as unknown as ConstructorParameters<typeof RecordsStore>[0];
    const store = new RecordsStore(
      recordClient,
      {
        kind: "agent",
        channelId: "fixture",
        agentRef: "fixture",
        objectKey: "fixture",
      },
      (message) => {
        throw new Error(message);
      },
    );
    store.attach({ runId, calls: [] });
    const { runScopedNatlangWorkflow } = await import(
      /* @vite-ignore */ pathToFileURL(
        join(host!, "scripts/run-scoped-natlang-workflow.mjs"),
      ).href
    );
    const configuration = await import(
      /* @vite-ignore */ pathToFileURL(
        join(host!, "src/dev/developmentTemplateConfig.cjs"),
      ).href
    );
    const { checkouts } =
      configuration.default.requireDevelopmentTemplateCheckouts(host);
    const program = loader(store, [
      checkouts["google-workspace"],
      checkouts.system,
    ]);
    for (const caseId of [
      "pdf-intake-handover-date",
      "scratch-handoff-incident-reversal",
      "template-candidate-coupled-conflicts",
      "google-workspace-inventory-quarterly-sheets",
      "publish-preflight-transit-map",
      "local-model-task-cypress-download",
      ...presentationWorlds.map(({ id }) => id),
    ]) {
      const result = await runScopedNatlangWorkflow(checkouts, caseId, {
        load: program.load.bind(program),
        async calls(query: {
          roots?: boolean;
          name?: string;
          parentCallId?: string;
        }) {
          return [...rows.values()]
            .filter(
              (row) =>
                (query.roots
                  ? row.parent_call_id === null
                  : row.parent_call_id === query.parentCallId) &&
                (!query.name || row.definition.name === query.name),
            )
            .map((row) => ({
              callId: row.call_id,
              parentCallId: row.parent_call_id,
              name: row.definition.name,
              runId,
              outcome: row.outcome,
            }));
        },
        async trace(callId: string) {
          return { record: rows.get(callId) };
        },
      }).catch((error: unknown) => {
        throw new Error(`Scoped workflow ${caseId} failed`, { cause: error });
      });
      expect(result, JSON.stringify(result)).toMatchObject({ passed: true });
    }
  },
);

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
