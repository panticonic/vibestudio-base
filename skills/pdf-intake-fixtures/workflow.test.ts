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
    else if (selected.domain === "mobileSystem") report = await domains.mobileSystem.runMobileScenario(selected.input);
    else if (selected.domain === "visualize") report = await domains.visualize.preparePresentation(selected.input);
    else report = await domains.pdfIntake.extractPdfEvidence(selected.input);
    return {results:[{kind:"domain",domain:selected.domain,operation:selected.operation,report}],remaining:[]};
  `,
  recallDecision: `
    const lead = await findDecision(request);
    return lead ? await verifyAtRevision(lead, request.field) : {status:"no-lead",leadId:null,citation:null};
  `,
  findDecision: `return await chooseLead(request, await searchHistory(request.query));`,
  searchHistory: "return await decisionRecall.search(query);",
  chooseLead:
    "return leads.find(lead => lead.eventId === request.eventId) ?? null;",
  verifyAtRevision: `
    const file = await readDecisionFile(lead.id);
    if (!file) return {status:"missing-source",leadId:lead.id,citation:null};
    const line = await locateField(field, file.text);
    const citation = await quoteLine.cite(file, field, line);
    return {status:citation ? "verified" : "missing-field",leadId:lead.id,citation};
  `,
  readDecisionFile: "return await decisionSource.read(leadId);",
  locateField: "return 1;",
  reviewProgram: `
    const sources = await inspectRevisions(request.compare);
    const findings = await reviewContract(request.contract, sources.candidate, sources.baseline);
    return {status:findings.length ? "changes-required" : "ready",candidateRevision:sources.candidate.revision,
      baselineRevision:sources.baseline?.revision ?? null,findings};
  `,
  inspectRevisions: `
    const candidate = await readAssignedProgram("candidate");
    return {candidate,baseline:compare ? await readAssignedProgram("baseline") : null};
  `,
  readAssignedProgram: "return await authoringCompiler.inspect(role);",
  reviewContract: `
    const signature = await checkSignature(contract,candidate.functions,baseline?.functions ?? []);
    const authority = await checkServices(contract,candidate.services,baseline?.services ?? []);
    const topology = await checkTopology(contract.requiredHelpers,candidate.functions);
    return signature.concat(authority,topology);
  `,
  checkSignature: `
    const entry = candidate.find(item => item.source === contract.entry);
    if (!entry) return [{code:"missing-entry",subject:contract.entry,observed:"missing",recovery:"Restore the entry."}];
    return entry.returns === contract.expectedReturn ? [] : [{code:"return-change",subject:entry.source,observed:entry.returns,recovery:"Restore the result type."}];
  `,
  checkServices: `return candidate.filter(name => !contract.declaredServices.includes(name)).map(name => ({code:"unexpected-service",subject:name,observed:"declared",recovery:"Remove the declaration."}));`,
  checkTopology: `return required.filter(path => !functions.some(fn => fn.source === path)).map(path => ({code:"missing-helper",subject:path,observed:"missing",recovery:"Restore the helper."}));`,
  runMobileScenario: `
    const target = await reviewSetup(request);
    if (target.status === "blocked") return await explainBlocker(target.blocker, request.deviceId);
    if (request.authority === "inspect") return {status:"target-ready",deviceId:target.deviceId};
    const report = request.scenario === "pair" ? await exercisePairing(target.deviceId) : await exerciseDevelopment(target.deviceId);
    return report.status === "blocked" ? await explainBlocker(report.blocker, target.deviceId, report.next) : report;
  `,
  reviewSetup: `
    const inventory = await readInventory();
    if (inventory.workspace !== request.workspace) return {status:"blocked",blocker:"wrong-workspace"};
    if (!inventory.tooling) return {status:"blocked",blocker:"missing-tooling"};
    if (request.authority === "execute" && !inventory.foreground) return {status:"blocked",blocker:"foreground-required"};
    if (request.scenario === "pair" && !inventory.provider) return {status:"blocked",blocker:"no-provider"};
    return await selectTarget(inventory.devices, request.deviceId);
  `,
  readInventory: "return await mobileInventory.read();",
  selectTarget: `
    const matching = requested === null ? devices.filter(x => x.state === "ready") : devices.filter(x => x.id === requested);
    if (matching.length > 1) return {status:"blocked",blocker:"ambiguous-device"};
    const device = matching[0] ?? (requested === null && devices.length === 1 ? devices[0] : undefined);
    if (!device) return {status:"blocked",blocker:"no-device"};
    if (device.state === "unauthorized") return {status:"blocked",blocker:"device-unauthorized"};
    if (device.state === "offline") return {status:"blocked",blocker:"device-offline"};
    return {status:"ready",deviceId:device.id};
  `,
  exercisePairing: `
    const receipt = await pairDevice(deviceId);
    if (!receipt) return {status:"blocked",deviceId,blocker:"invalid-receipt",next:"Check the receipt."};
    const readback = await readWorkspace(receipt.pairedDevice);
    if (!readback) return {status:"blocked",deviceId,blocker:"invalid-receipt",next:"Read the assigned pairing."};
    if (readback.status === "ready") return {status:"paired-ready",deviceId,receipt,readback};
    return {status:"blocked",deviceId,blocker:readback.status === "opening" ? "workspace-opening" : "workspace-failed",next:readback.message};
  `,
  pairDevice: "return await mobilePairing.pair(deviceId);",
  readWorkspace: "return await mobileWorkspace.read(pairedDevice);",
  exerciseDevelopment: `
    const receipt = await installApp(deviceId);
    if (!receipt) return {status:"blocked",deviceId,blocker:"invalid-receipt",next:"Check the installation receipt."};
    const readback = await readInstalledApp(deviceId, receipt.packageName);
    if (!readback) return {status:"blocked",deviceId,blocker:"invalid-receipt",next:"Read the assigned app."};
    if (readback.installed && readback.bundleActive && readback.rendering && readback.screenshotBytes > 0 && !readback.issues.length)
      return {status:"development-ready",deviceId,receipt,readback};
    return {status:"blocked",deviceId,blocker:"app-unverified",next:readback.issues.join(" ") || "Verify a nonempty screenshot."};
  `,
  installApp: "return await mobileDevelopment.install(deviceId);",
  readInstalledApp: "return await mobileApp.verify(deviceId, packageName);",
  explainBlocker:
    'return {status:"blocked",blocker,deviceId,next:observed ?? blocker};',
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
  searchHistory: ["decisionRecall"],
  readDecisionFile: ["decisionSource"],
  readAssignedProgram: ["authoringCompiler"],
  readInventory: ["mobileInventory"],
  pairDevice: ["mobilePairing"],
  readWorkspace: ["mobileWorkspace"],
  installApp: ["mobileDevelopment"],
  readInstalledApp: ["mobileApp"],
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

function loader(
  store?: RecordsStore,
  workspaceCheckouts: string[] = [],
  runWorkflowCode?: string,
) {
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
      const code =
        name === "runWorkflow" && runWorkflowCode
          ? runWorkflowCode
          : reference[name];
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
  "runs Personal's verification stages through the shared Workerd tree",
  async () => {
    const config = await import(
      /* @vite-ignore */ pathToFileURL(
        join(host!, "src/dev/developmentTemplateConfig.cjs"),
      ).href
    );
    const { checkouts } =
      config.default.requireDevelopmentTemplateCheckouts(host);
    const program = loader(
      undefined,
      [checkouts.personal],
      `
    const work = request.work[0];
    const report = await domains.verifiedMemory.recallDecision(work.input);
    return {results:[{kind:"domain",domain:work.domain,operation:work.operation,report}],remaining:[]};
  `,
    );
    const request = {
      goal: "Verify the old chosen limit",
      query: "bench limit",
      eventId: "owned-event",
      field: "Bench limit",
    };
    const calls: string[] = [];
    const run = (await program.load(
      "skills/vibestudio-workflows/runWorkflow.nl",
      {
        services: {
          decisionRecall: {
            async search(query: string) {
              calls.push(query);
              return [
                {
                  id: "other",
                  eventId: "new-event",
                  snippet: "Changed the limit.",
                },
                {
                  id: "selected",
                  eventId: "owned-event",
                  snippet: "Recorded the first limit.",
                },
              ];
            },
          },
          decisionSource: {
            async read(id: string) {
              calls.push(id);
              return {
                eventId: "owned-event",
                path: "projects/fixture/decision.md",
                contentHash: "owned-file",
                text: "# Decision\nBench limit: 12",
              };
            },
          },
        },
      },
    )) as (input: unknown) => Promise<unknown>;
    const value = await run({
      goal: request.goal,
      work: [
        {
          kind: "domain",
          domain: "verifiedMemory",
          operation: "recallDecision",
          input: request,
        },
      ],
    });
    expect(calls).toEqual(["bench limit", "selected"]);
    expect(value).toMatchObject({
      remaining: [],
      results: [
        {
          operation: "recallDecision",
          report: {
            status: "verified",
            leadId: "selected",
            citation: {
              eventId: "owned-event",
              line: 2,
              quote: "Bench limit: 12",
            },
          },
        },
      ],
    });
  },
);

it("reviews a live compiler description from the shared Workerd program", async () => {
  const program = loader(
    undefined,
    [],
    `
    const work = request.work[0];
    const report = await domains.natlangAuthoring.reviewProgram(work.input);
    return {results:[{kind:"domain",domain:work.domain,operation:work.operation,report}],remaining:[]};
  `,
  );
  const reads: string[] = [];
  const run = (await program.load(
    "skills/vibestudio-workflows/runWorkflow.nl",
    {
      services: {
        authoringCompiler: {
          async inspect(role: string) {
            reads.push(role);
            const shape = await program.describe("skills/pdf-intake");
            return {
              role,
              revision: "owned-source",
              state: "compiled",
              functions: shape.functions.map(({ source, params, returns }) => ({
                source,
                parameters: params,
                returns,
              })),
              services: shape.services,
            };
          },
        },
      },
    },
  )) as (input: unknown) => Promise<unknown>;
  const goal =
    "Review the PDF skill's typed return, declared services, and callable helpers.";
  const actual = await run({
    goal,
    work: [
      {
        kind: "domain",
        domain: "natlangAuthoring",
        operation: "reviewProgram",
        input: {
          goal,
          compare: false,
          contract: {
            entry: "extractPdfEvidence.nl",
            expectedParameters: null,
            expectedReturn: "string",
            declaredServices: ["pdfIntakeProbe"],
            requiredHelpers: ["extractPdfEvidence/missing.nl"],
            preserveBaseline: false,
          },
        },
      },
    ],
  });
  expect(reads).toEqual(["candidate"]);
  expect(actual).toMatchObject({
    remaining: [],
    results: [
      {
        operation: "reviewProgram",
        report: {
          status: "changes-required",
          candidateRevision: "owned-source",
          baselineRevision: null,
          findings: [
            {
              code: "return-change",
              subject: "extractPdfEvidence.nl",
              observed: "PdfIntakeReport",
            },
            { code: "unexpected-service", subject: "pdfIntakeRead" },
            {
              code: "missing-helper",
              subject: "extractPdfEvidence/missing.nl",
            },
          ],
        },
      },
    ],
  });
});

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
    const mobile = (await import(
      /* @vite-ignore */ pathToFileURL(
        join(
          checkouts["system-testing"],
          "skills/mobile-system-testing-fixtures/worlds.ts",
        ),
      ).href
    )) as { mobileScenarioWorlds: { id: string }[] };
    const program = loader(store, [
      checkouts["google-workspace"],
      checkouts.system,
      checkouts["system-testing"],
    ]);
    for (const caseId of [
      "pdf-intake-handover-date",
      "scratch-handoff-incident-reversal",
      "template-candidate-coupled-conflicts",
      "google-workspace-inventory-quarterly-sheets",
      "publish-preflight-transit-map",
      "local-model-task-cypress-download",
      ...presentationWorlds.map(({ id }) => id),
      ...mobile.mobileScenarioWorlds.map(({ id }) => id),
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
