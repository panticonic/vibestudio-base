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
import { bindChannelMembership } from "../../../skills/agents/channelMembershipBoundary.js";
import { localReviewerWorlds } from "../../../skills/channel-agent-membership-fixtures/localReviewerWorlds.js";
import { approvalVisibilityWorlds } from "../../../skills/approval-visibility-fixtures/worlds.js";
import { verifyApprovalVisibility } from "../../../skills/approval-visibility-fixtures/verify.js";
import { membershipReference } from "../../../skills/channel-agent-membership-fixtures/reference.js";
import { bindTerminalReceiptReview } from "../../../skills/terminal/receipt-review.js";

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

it("admits only the needed checklist toggles through the shared workflow", async () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const steps: Record<string, string> = {
    runWorkflow: `
      const item = request.work[0];
      const report = await domains.terminalChecklist.verifyChecklist(item.input);
      return {results: [{kind: "domain", domain: item.domain, operation: item.operation, report}], remaining: []};
    `,
    verifyChecklist: `
      const initial = await openSession();
      const target = request.target;
      const keys = target ? await planEdits(request.goal, target, initial.checked) : request.keys;
      if (target && !await targetChecks.matchesPlan(target, initial.checked, keys))
        return {status: "mismatch", screens: [initial], continuation: request.continuation};
      const screens = [initial, ...await editItems(keys)];
      const final = await resumeSession(request.continuation);
      screens.push(final);
      const status = !target || await targetChecks.matchesTarget(target, initial.checked, final.checked)
        ? await inspectOutcome({goal: request.goal, keys, continuation: request.continuation}, screens)
        : "mismatch";
      return {status, screens, continuation: request.continuation};
    `,
    planEdits: `
      const needed = await targetChecks.changes(target, initial);
      return goal === "Test an invalid plan" ? ["1", "1"] : [...needed.check, ...needed.clear];
    `,
    openSession: "return await launchApp();",
    launchApp: "return await checklistOpen.launch();",
    editItems:
      "const screens = []; for (const key of keys) screens.push(await sendToggle(key)); return screens;",
    sendToggle: "return await checklistKeys.toggle(key);",
    resumeSession: "return await continueApp(kind);",
    continueApp: "return await checklistResume.resume(kind);",
    inspectOutcome: 'return "verified";',
  };
  const failures = new Set<string>();
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      const code = steps[session.lam.functionName ?? ""];
      if (!code)
        throw new Error(
          `Unexpected checklist call ${session.lam.functionName}`,
        );
      const action = await session.applyAsync("eval", { code, finish: true });
      if (action.kind === "rejected" || action.kind === "error") {
        failures.add(`${session.lam.functionName}: ${action.text}`);
        throw new Error(action.text);
      }
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
  for (const goal of [
    "Confirm rollback before clearing build",
    "Test an invalid plan",
    "Replay the assigned keys",
  ]) {
    const checked = new Set(["1", "2"]);
    const keys: string[] = [];
    const screen = (ptyId = "before", cols = 80, rows = 24) => ({
      sessionId: "owned-checklist",
      ptyId,
      cols,
      rows,
      checked: [...checked].sort(),
    });
    const run = (await loader.load(
      "skills/vibestudio-workflows/runWorkflow.nl",
      {
        services: {
          checklistOpen: { launch: async () => screen() },
          checklistKeys: {
            toggle: async (key: string) => {
              keys.push(key);
              if (!checked.delete(key)) checked.add(key);
              return screen();
            },
          },
          checklistResume: { resume: async () => screen("after", 62, 18) },
        },
      },
    )) as (request: unknown) => Promise<unknown>;
    const valid = goal !== "Test an invalid plan";
    const result = await run({
      goal,
      work: [
        {
          kind: "domain",
          domain: "terminalChecklist",
          operation: "verifyChecklist",
          input: {
            goal,
            continuation: "restart",
            ...(goal === "Replay the assigned keys"
              ? { keys: ["3", "1"] }
              : { target: { checked: ["3"], unchecked: ["1"] } }),
          },
        },
      ],
    }).catch((error: unknown) => {
      throw new Error([...failures, String(error)].join("\n"), {
        cause: error,
      });
    });
    expect(result).toMatchObject({
      results: [{ report: { status: valid ? "verified" : "mismatch" } }],
    });
    expect(keys).toEqual(valid ? ["3", "1"] : []);
  }
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
    ...membershipReference,
    reviewApprovalQueues: `
      const surfaces = [];
      for (const source of await selectApprovalSurfaces(request.caller)) {
        surfaces.push(await reviewApprovalSurface(source, request.receipts));
      }
      const coverage = await summarizeApprovalVisibility(surfaces);
      const location = await locatePendingApproval(request.approvalId, surfaces, coverage);
      return {coverage, surfaces, location};
    `,
    selectApprovalSurfaces: `
      if (caller === "device-workspace") return ["workspace", "hub"];
      return [caller === "device-account" ? "hub" : "workspace"];
    `,
    reviewApprovalSurface: `
      const receipt = await latestApprovalReceipt(source, receipts);
      if (receipt?.kind === "snapshot") return {source, state: "visible", ids: receipt.ids};
      return {source, state: receipt?.kind === "unavailable" ? "unavailable" : "awaiting-snapshot", ids: []};
    `,
    summarizeApprovalVisibility: `
      const visible = surfaces.filter(item => item.state === "visible").length;
      return visible === 0 ? "unknown" : visible === surfaces.length ? "complete" : "partial";
    `,
    locatePendingApproval: `
      if (approvalId === null) return {status: "unassigned", source: null};
      const found = surfaces.find(item => item.state === "visible" && item.ids.includes(approvalId));
      if (found) return {status: "located", source: found.source};
      return {status: coverage === "complete" ? "absent" : "unconfirmed", source: null};
    `,
    runRosterPlan: `
      const earlier = [], findings = [];
      for (const step of request.steps) {
        const blockedBy = await checkPriorOutcome(step, earlier, findings);
        const result = blockedBy ? null : await manageChannelAgent(step.request);
        findings.push({ id: step.id, result, blockedBy });
        earlier.push(step);
      }
      return { findings };
    `,
    checkPriorOutcome: `
      if (step.request.action === "inspect") return null;
      const index = earlierSteps.findLastIndex((entry, index) =>
        earlierFindings[index].result &&
        entry.request.channelId === step.request.channelId &&
        entry.request.contextId === step.request.contextId &&
        entry.request.handle === step.request.handle);
      const result = earlierFindings[index]?.result;
      return result && (result.status === "uncertain" || result.state === "conflict" ||
        result.state === "unavailable") ? earlierSteps[index].id : null;
    `,
    runWorkflow: `
      const remote = request.work[0];
      if (remote.domain === "capabilities" && remote.operation === "reviewApprovalQueues") {
        const report = await domains.capabilities.reviewApprovalQueues(remote.input);
        return {results:[{kind:"domain",domain:remote.domain,operation:remote.operation,report}],remaining:[]};
      }
      if (remote.domain === "testReview") {
        const report = await domains.testReview.reviewRetainedFailure(remote.input);
        return {results:[{kind:"domain",domain:"testReview",operation:remote.operation,report}],remaining:[]};
      }
      if (remote.domain === "github") {
        const report = remote.operation==="diagnoseGitHubOperation"
          ? await domains.github.diagnoseGitHubOperation(remote.input)
          : await domains.github.reviewGitHubSetup(remote.input);
        return {results:[{kind:"domain",domain:"github",operation:remote.operation,report}],remaining:[]};
      }
      if (remote.domain === "personal") {
        const report = await domains.personal.runPersonalWorkflow(remote.input);
        return {results:[{kind:"domain",domain:"personal",operation:remote.operation,report}],remaining:[]};
      }
      if (remote.domain === "personalFacility") {
        const report = await domains.personalFacility.reviewPersonalFacility(remote.input);
        return {results:[{kind:"domain",domain:"personalFacility",operation:remote.operation,report}],remaining:[]};
      }
      if (remote.domain === "unitDesign") {
        const report = await domains.unitDesign.reviewWorkspaceUnit(remote.input);
        return {results:[{kind:"domain",domain:"unitDesign",operation:remote.operation,report}],remaining:[]};
      }
      if (remote.domain === "deviceAndTerminal") {
        const report = await domains.deviceAndTerminal.reviewDeviceAndTerminal(remote.input);
        return {results:[{kind:"domain",domain:"deviceAndTerminal",operation:remote.operation,report}],remaining:[]};
      }
      if (remote.domain === "serverLogs") {
        const report = await domains.serverLogs.reviewHostLogHandoff(remote.input);
        return {results:[{kind:"domain",domain:remote.domain,operation:remote.operation,report}],remaining:[]};
      }
      if (remote.domain === "remoteAccess") {
        if (remote.operation === "reviewRemoteRoute") {
          const report = await domains.remoteAccess.reviewRemoteRoute(remote.input);
          return {results:[{kind:"domain",domain:remote.domain,operation:remote.operation,report}],remaining:[]};
        }
        const report = await domains.remoteAccess[remote.operation](remote.input);
        return {results:[{kind:"domain",domain:remote.domain,operation:remote.operation,report}],remaining:[]};
      }
      const system = request.work[1];
      if (system.domain === "localModel") {
        const report = await domains.localModel.prepareLocalModel(system.input);
        const results = [{kind: "domain", domain: system.domain, operation: system.operation, report}];
        const channel = request.work[0];
        if (report.disposition !== "ready-to-delegate" || report.handoff?.ref !== channel.input.options.modelRef) {
          return {results, remaining: ["Selected model is not eligible"]};
        }
        const membership = await domains.channelAgent.manageChannelAgent(channel.input);
        results.push({kind: "domain", domain: channel.domain, operation: channel.operation, report: membership});
        return {results, remaining: []};
      }
      const report = await domains.system.investigateSystem(system.input);
      const results = [{kind: "domain", domain: system.domain, operation: system.operation, report}];
      if (report.status !== "attention") return {results, remaining: ["No established regression"]};
      const next = request.work[0];
      results.push({kind: "domain", domain: next.domain, operation: next.operation,
        report: await domains.automation.prepareAutomation(next.input)});
      return {results, remaining: []};
    `,
    reviewRemoteRoute: `
      const observed=await readGatewayIdentity(request.operationId);
      const {verdict,diagnostic}=await compareGatewayIdentity(request,observed);
      const layer=await remoteLayer(diagnostic);
      return {observed,verdict,layer,next:await routeHandoff(verdict,layer)};
    `,
    readGatewayIdentity: "return await remoteGatewayIdentity.observe(operationId);",
    remoteLayer: `
      if(diagnosis.includes("different workspace ID")) return "workspace-routing";
      if(diagnosis.includes("does not belong")) return "device-credential";
      return "healthy";
    `,
    routeHandoff: `
      if(verdict==="verified") return "accept-identity";
      if(verdict==="workspace-mismatch"&&layer==="workspace-routing") return "refresh-workspace-reach";
      return "verify-server-assignment";
    `,
    reviewRetainedFailure: `
      const packet = await readRetainedFailure(request.operationId);
      const identified = await matchesAssignment(request,packet);
      const ids = {runId:request.runId,testName:request.testName};
      if (!identified) return {...ids,status:"unavailable",triage:null};
      const {class: failureClass, evidence} = await reviewSystemTest({kind:"triage",goal:request.goal,failure:packet.failure});
      return {...ids,status:"triaged",triage:{class:failureClass,evidence}};
    `,
    readRetainedFailure: "return await retainedTestFailure.inspect(operationId);",
    reviewSystemTest: 'return { kind:"triage", ...(await triageFailure(request.failure)) };',
    triageFailure: "return await triage(failure);",
    reviewGitHubSetup: `
      const status = await readGitHubSetup(request.operationId);
      const accessLevel = await accessLevelFor(request.goal);
      const route = await resolveGitHubRoute(request.operationId, accessLevel);
      return {status, accessLevel, route, handoff: await chooseSetupHandoff(route,request.interactive)};
    `,
    readGitHubSetup: "return await githubSetupRead.inspect(operationId);",
    accessLevelFor: `
      return intent.includes("Pages") ? "publish-pages" :
        intent.includes("create a GitHub repository") ? "publish" : "read-only";
    `,
    resolveGitHubRoute: "return await githubSetupRoute.resolve(operationId, accessLevel);",
    chooseSetupHandoff: 'return route.action==="render-setup" ? (interactive?"offer-setup":"interactive-required") : route.action;',
    diagnoseGitHubOperation: `
      const observation=await readGitHubDiagnosis(request.operationId);
      const diagnosis=observation.failure?await troubleshootGithub(observation.failure):null;
      const setup=diagnosis?.cause==="not-connected"&&observation.setup
        ?await reviewGitHubSetup(observation.setup):null;
      return {observation,diagnosis,setup};
    `,
    readGitHubDiagnosis: "return await githubDiagnosisRead.inspect(operationId);",
    troubleshootGithub: "return await steps(await cause(failure));",
    cause: 'return failure.includes("Invalid GitHub remote")?"invalid-remote":"not-connected";',
    runPersonalWorkflow: `
      const task=request.work[0];
      return {results:[{kind:task.kind,report:await resumeRepositoryWork(task.input)}],unresolved:[]};
    `,
    resumeRepositoryWork: `
      const repository=await planRepositoryWork(await readRepository(request.operationId));
      const action=await chooseOwnerAction(repository);
      const owner=action==="skip"?null:await routeSetup(await readOwnerRoute(request.operationId,action));
      return {repository,owner};
    `,
    readRepository: "return await repositoryResumeRead.inspect(operationId);",
    readOwnerRoute: "return await repositoryOwnerRead.resolve(operationId,action);",
    chooseOwnerAction: 'return repository.decision==="request-access"?"setup":"skip";',
    planRepositoryWork: `
      const {operation,ambiguous}=await interpretGitWork(request.goal);
      const access=await chooseAccess(request.goal,operation);
      const decision=await assessRepo(request,operation,access,ambiguous);
      return {repository:request.repository,operation,access,decision,...await writePlan(request,operation,decision)};
    `,
    interpretGitWork: 'return {operation:goal.includes("push")?"push":"pull",ambiguous:false};',
    chooseAccess: 'return operation==="push"?"collaborate":"read-only";',
    assessRepo: 'return request.workingTree==="dirty"?"review-local-changes":"request-access";',
    writePlan: "return {facts:[request.workingTree],next:[decision]};",
    routeSetup: `
      const {capabilityIds,unknownIds}=await assessSetup(request);
      const selected=await selectAction(request,capabilityIds);
      return {...selected,capabilityIds,unknownIds,brief:await explainNext(request,selected.action,unknownIds)};
    `,
    assessSetup: "return {capabilityIds:[request.selection.capabilityId],unknownIds:[]};",
    selectAction: 'return {action:"follow-owner-route",routeId:request.selection.id,workspaceScope:"current"};',
    explainNext: 'return "Open the installed GitHub owner route.";',
    reviewPersonalFacility: "return await reviewLiveMission(request);",
    reviewLiveMission: "return await reviewMission(await readMissionCard(request.operationId));",
    readMissionCard: "return await missionFacilityRead.inspect(operationId);",
    reviewMission: `
      const gate=await establishMissionCard(input);
      if(gate) return gate;
      return await inspectMissionBoundary(input);
    `,
    establishMissionCard: `
      const {target,card}=input;
      if(card.revision!==target.expectedRevision) return {
        status:"attention",findings:[{code:"reread-task-revision",evidenceIds:[target.id,card.id]}]
      };
      if(!card.dependencyAccepted) return {
        status:"waiting",findings:[{code:"dependencies-unaccepted",evidenceIds:[card.id]}]
      };
      return null;
    `,
    inspectMissionBoundary: `
      return {status:"waiting",findings:[{code:"canonical-run-unobserved",evidenceIds:[input.card.id]}]};
    `,
    reviewWorkspaceUnit: "return await reviewLiveExtensionDesign(request);",
    reviewLiveExtensionDesign: `
      const observation=await readExtensionDesign(request.operationId);
      const working=await reviewExtension(observation.working);
      const published=await reviewExtension(observation.published);
      return await combineWork([working,published,await reviewManifestPublication(observation)]);
    `,
    readExtensionDesign: "return await extensionDesignRead.inspect(operationId);",
    reviewExtension: "return await inspectManifest(evidence);",
    inspectManifest: `
      const {receipt}=evidence;
      return {decision:receipt.errorCode?"revision-needed":"ready",
        finding:receipt.errorCode??"manifest-verified",evidenceIds:[receipt.id]};
    `,
    reviewManifestPublication: `
      const {working,published}=observation;
      const same=working.candidateDigest===published.candidateDigest;
      return {decision:same?"ready":"waiting",finding:same?"manifest-published":"manifest-not-published",
        evidenceIds:[working.receipt.id,published.receipt.id]};
    `,
    combineWork: `
      const invalid=components.some(row=>row.decision==="revision-needed");
      const waiting=components.some(row=>row.decision==="waiting");
      return {decision:invalid?"revision-needed":waiting?"waiting":"ready",
        finding:invalid?"required-revision":waiting?"pending-lifecycle":"prerequisites-verified",
        evidenceIds:[...new Set(components.flatMap(row=>row.evidenceIds))],components};
    `,
    reviewDeviceAndTerminal: "return await reviewLiveTerminal(request);",
    reviewLiveTerminal: "return await reviewTerminal(await readTerminalEvidence(request.operationId));",
    readTerminalEvidence: "return await terminalEvidenceRead.inspect(operationId);",
    reviewTerminal: "return (await inspectInvocation(input)) ?? (await inspectExecution(input));",
    inspectInvocation: `
      const {target,invocation}=input;
      if(invocation?.operationId!==target.operationId||invocation?.contextId!==target.contextId)
        return {status:"blocked",findings:[]};
      return null;
    `,
    inspectExecution: `
      const {target,result}=input;
      if(result.operationId!==target.operationId) return {
        status:"blocked",findings:[{code:"result-target-mismatch",evidenceIds:[target.id,result.id]}]
      };
      return {status:result.truncated?"attention":"ready",
        findings:[{code:result.truncated?"success-output-truncated":"execution-succeeded",evidenceIds:[result.id]}]};
    `,
    reviewHostLogHandoff: `
      const windows = await prepareWindows(request);
      const earlier = await briefServerLog(windows.earlier);
      const later = await briefServerLog(windows.later);
      await checkBoot(request.serverBootId, earlier, later);
      return {status:await interpretLogProgress(request.goal, earlier, later), earlier, later};
    `,
    briefServerLog: `
      const snapshot = await gather(request);
      const groups = await condense(snapshot.records);
      const classes = await Promise.all(groups.map(group => classifyHostLogGroup(group)));
      return await assemble(snapshot, groups, classes);
    `,
    classifyHostLogGroup: 'return group.message.includes("failed") ? "failure" : "routine";',
    interpretLogProgress: `
      if (later.findings.some(finding => earlier.findings.some(old => old.message === finding.message)))
        return "recurring-failure";
      return "new-failure";
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
    prepareLocalModel: `
      const initial = await inspectSelected(request.modelRef);
      await decideInstallation(request, initial);
      const decision = initial.disposition === "usable"
        ? await planDelegation(request, initial.row) : {disposition: initial.disposition, handoff: null};
      return {...decision, ref: request.modelRef, state: initial.row?.state ?? null, receipt: null};
    `,
    inspectSelected: `
      const row = await localModelTaskInventory.inspect(ref);
      return {row, disposition: await interpretState(row)};
    `,
    interpretState:
      'return row.state === "downloading" ? "wait-for-progress" : "usable";',
    decideInstallation: 'return "skip";',
    planDelegation: `
      if (!row.toolsCapable && request.needsTools) return {disposition: "unsupported-tools", handoff: null};
      if (row.contextWindow < request.minimumContext) return {disposition: "context-too-small", handoff: null};
      return {disposition: "ready-to-delegate", handoff: {ref: row.ref, mode: "fresh"}};
    `,
  };
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      if (!runReference) throw new Error(validated);
      const name = session.lam.functionName;
      const code = name && referenceSteps[name];
      if (!code) throw new Error(`No scripted reference for ${name}`);
      if (["resumeRepositoryWork", "readRepository", "readOwnerRoute", "chooseOwnerAction", "routeSetup"].includes(name)) {
        const expected = name === "readRepository" ? ["repositoryResumeRead"] :
          name === "readOwnerRoute" ? ["repositoryOwnerRead"] : [];
        expect(Object.keys(session.availableServices())).toEqual(expected);
      }
      if (["reviewPersonalFacility", "reviewLiveMission", "readMissionCard", "reviewMission", "establishMissionCard", "inspectMissionBoundary"].includes(name)) {
        expect(Object.keys(session.availableServices())).toEqual(name === "readMissionCard" ? ["missionFacilityRead"] : []);
      }
      if (["reviewWorkspaceUnit", "reviewLiveExtensionDesign", "readExtensionDesign", "reviewExtension", "inspectManifest", "reviewManifestPublication", "combineWork"].includes(name)) {
        expect(Object.keys(session.availableServices())).toEqual(name === "readExtensionDesign" ? ["extensionDesignRead"] : []);
      }
      if (["reviewDeviceAndTerminal", "reviewLiveTerminal", "readTerminalEvidence", "reviewTerminal", "inspectInvocation", "inspectExecution"].includes(name)) {
        expect(Object.keys(session.availableServices())).toEqual(name === "readTerminalEvidence" ? ["terminalEvidenceRead"] : []);
      }
      if (["diagnoseGitHubOperation", "readGitHubDiagnosis", "troubleshootGithub", "cause"].includes(name)) {
        expect(Object.keys(session.availableServices())).toEqual(name === "readGitHubDiagnosis" ? ["githubDiagnosisRead"] : []);
      }
      if (["reviewHostLogHandoff", "briefServerLog", "classifyHostLogGroup", "interpretLogProgress"].includes(name)) {
        expect(Object.keys(session.availableServices())).toEqual(name === "briefServerLog" ? ["serverLog"] : []);
      }
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
        "reconcileAutomation",
        "preflightPublication",
        "reviewTemplate",
        "reviewProblem",
        "reviewProvenance",
        "reviewDeviceAndTerminal",
        "reviewResearchIntake",
        "reviewWorkspaceUnit",
        "reviewRuntimeEvidence",
        "reviewConversation",
        "manageChannelAgent",
        "runRosterPlan",
        "reviewPanelHealth",
        "reviewMediaAndImport",
        "extractPdfEvidence",
        "assembleHandoff",
        "stageTemplateCandidate",
      ],
    ],
    [
      join(templateRoot, "google-workspace"),
      ["guideGoogleWorkspace", "reviewGmailWorkflow"],
    ],
    [
      join(templateRoot, "personal"),
      [
        "runPersonalWorkflow",
        "reviewGitHubSetup",
        "reviewPersonalFacility",
        "recallDecision",
        "compareDecisionRevisions",
        "organizeCollection",
        "curateBrowserLibrary",
        "reconcileMissionPlan",
      ],
    ],
    [
      join(templateRoot, "system"),
      [
        "investigateSystem",
        "prepareLocalModel",
        "openRemoteWorkspace",
        "reviewHostLogHandoff",
        "reviewRemoteRoute",
        "deployRemoteServer",
        "commissionRemoteWorkspace",
      ],
    ],
    [
      join(templateRoot, "system-testing"),
      ["reviewSystemTest", "reviewRetainedFailure", "reviewSessionTest"],
    ],
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
  if (description.functions.some(({ name }) => name === "reviewHostLogHandoff")) {
    runReference = true;
    const queries: unknown[] = [];
    const logLines = [11, 12, 21].map((seq) => ({
      seq, timestamp: 1000 + seq, level: "warn", tag: "Worker",
      message: "Preparation failed on the storage binding", pid: 1,
    }));
    const run = (await loader.load("skills/vibestudio-workflows/runWorkflow.nl", {
      services: {
        serverLog: {
          async tail() { throw new Error("Expected two fixed windows"); },
          async query(filter: { sinceSeq: number; untilSeq: number }) {
            queries.push(filter);
            return {
              records: logLines.filter(({ seq }) => seq > filter.sinceSeq && seq <= filter.untilSeq),
              latestSeq: 24, workspaceId: "system", serverBootId: "boot", pid: 1, startedAt: 1,
            };
          },
          async stats() {
            return { bufferSize: 24, totalCaptured: 24, oldestSeq: 1, latestSeq: 24,
              byLevel: { verbose: 0, info: 0, warn: 24, error: 0 }, byTag: [] };
          },
        },
      },
    })) as (input: unknown) => Promise<unknown>;
    const request = {
      goal: "Check for recurring worker preparation failure", serverBootId: "boot",
      earlier: { after: 10, through: 12 }, later: { after: 20, through: 21 }, tag: "Worker",
    };
    const execute = (input: typeof request) => run({ goal: input.goal, work: [
      { kind: "domain", domain: "serverLogs", operation: "reviewHostLogHandoff", input },
    ] });
    await expect(execute(request)).resolves.toMatchObject({
      remaining: [], results: [{ report: {
        status: "recurring-failure",
        earlier: { findings: [{ count: 2, firstSeq: 11, lastSeq: 12 }] },
        later: { findings: [{ count: 1, firstSeq: 21, lastSeq: 21 }] },
      } }],
    });
    expect(queries).toMatchObject([
      { sinceSeq: 10, untilSeq: 12, tag: "Worker", limit: 301 },
      { sinceSeq: 20, untilSeq: 21, tag: "Worker", limit: 301 },
    ]);
    expect(stagedCalls.splice(0)).toEqual([
      "runWorkflow", "reviewHostLogHandoff", "briefServerLog", "classifyHostLogGroup",
      "briefServerLog", "classifyHostLogGroup", "interpretLogProgress",
    ]);
    queries.length = 0;
    await expect(execute({ ...request, later: { after: 11, through: 21 } })).rejects.toThrow();
    expect(queries).toEqual([]);
    stagedCalls.length = 0;
    await expect(execute({ ...request, serverBootId: "expired-boot" })).rejects.toThrow();
    expect(stagedCalls.splice(0)).not.toContain("interpretLogProgress");
    runReference = false;
  }
  if (description.functions.some(({ name }) => name === "runPersonalWorkflow")) {
    runReference = true;
    for (const [operation, dirty, decision] of [
      ["pull", false, "request-access"],
      ["push", true, "review-local-changes"],
    ] as const) {
      const goal = `Prepare to ${operation} the assigned repository.`;
      const readbacks: string[] = [];
      const run = (await loader.load("skills/vibestudio-workflows/runWorkflow.nl", {
        services: {
          repositoryResumeRead: {
            async inspect(operationId: string) {
              expect(operationId).toBe("assigned-repository");
              readbacks.push("inspect");
              return {
                goal, repository: "projects/assigned",
                workingTree: dirty ? "dirty" : "clean",
                availableAccess: [], remoteVerified: null, upstream: "unknown",
              };
            },
          },
          repositoryOwnerRead: {
            async resolve(operationId: string, action: string) {
              expect([operationId, action]).toEqual(["assigned-repository", "setup"]);
              readbacks.push("resolve");
              return {
                goal, origin: "selection",
                selection: {
                  id: "connection.github/setup", capabilityId: "connection.github",
                  action, via: "owner-skill", ownerSkillPath: "skills/github/SKILL.md",
                },
                capabilities: [{
                  id: "connection.github", label: "GitHub", owner: "skills/github/SKILL.md", state: "not-configured",
                }],
              };
            },
          },
        },
      })) as (input: unknown) => Promise<unknown>;
      stagedCalls.length = 0;
      await expect(run({
        goal,
        work: [{ kind: "domain", domain: "personal", operation: "runPersonalWorkflow", input: {
          goal, work: [{ kind: "resumeRepositoryWork", input: { goal, operationId: "assigned-repository" } }],
        } }],
      })).resolves.toMatchObject({
        results: [{ report: { results: [{ kind: "resumeRepositoryWork", report: {
          repository: { operation, decision },
          owner: dirty ? null : { routeId: "connection.github/setup" },
        } }] } }],
      });
      expect(readbacks).toEqual(dirty ? ["inspect"] : ["inspect", "resolve"]);
      expect(stagedCalls.splice(0)).toEqual([
        "runWorkflow", "runPersonalWorkflow", "resumeRepositoryWork", "readRepository",
        "planRepositoryWork", "interpretGitWork", "chooseAccess", "assessRepo", "writePlan", "chooseOwnerAction",
        ...(dirty ? [] : ["readOwnerRoute", "routeSetup", "assessSetup", "selectAction", "explainNext"]),
      ]);
    }
    runReference = false;
  }
  if (description.functions.some(({ name }) => name === "reviewPersonalFacility")) {
    runReference = true;
    const goal = "Check the assigned card before assuming it can run.";
    const operationId = "released-card";
    const input = { kind: "mission-live", goal, operationId };
    const readback = {
      kind: "mission", goal,
      target: { id: operationId, taskId: "card", expectedRevision: 3 },
      card: {
        id: "card", taskId: "card", revision: 3, state: "ready",
        projectArchived: false, dependencyAccepted: true, automationId: null,
      },
      detail: { kind: "execution", intent: "start", automationKind: null, receipt: null },
    };
    const reads: string[] = [];
    const run = (await loader.load("skills/vibestudio-workflows/runWorkflow.nl", {
      services: { missionFacilityRead: { async inspect(id: string) {
        reads.push(id);
        return structuredClone(readback);
      } } },
    })) as (input: unknown) => Promise<unknown>;
    for (const [revision, accepted, code] of [
      [4, true, "reread-task-revision"],
      [3, false, "dependencies-unaccepted"],
      [3, true, "canonical-run-unobserved"],
    ] as const) {
      readback.card.revision = revision;
      readback.card.dependencyAccepted = accepted;
      stagedCalls.length = 0;
      await expect(run({ goal, work: [{
        kind: "domain", domain: "personalFacility", operation: "reviewPersonalFacility", input,
      }] })).resolves.toMatchObject({
        results: [{report: {
          status: revision === 4 ? "attention" : "waiting",
          findings: [{code, evidenceIds: revision === 4 ? [operationId, "card"] : ["card"]}],
        }}],
      });
      expect(reads.splice(0)).toEqual([operationId]);
      expect(stagedCalls.splice(0)).toEqual([
        "runWorkflow", "reviewPersonalFacility", "reviewLiveMission", "readMissionCard",
        "reviewMission", "establishMissionCard", ...(revision === 3 && accepted ? ["inspectMissionBoundary"] : []),
      ]);
    }
    runReference = false;
  }
  if (description.functions.some(({ name }) => name === "reviewWorkspaceUnit")) {
    runReference = true;
    const goal = "Review the assigned extension's design against protected main.";
    const operationId = "assigned-design";
    const input = { kind: "extension-design-live", goal, operationId };
    const reads: string[] = [];
    const makeManifest = (side: string, candidateDigest: string, errorCode: string | null) => ({
      kind: "manifest", source: "extensions/assigned", candidateDigest,
      receipt: { id: `${operationId}:${side}`, unit: "extensions/assigned", candidateDigest, errorCode },
    });
    for (const [digest, failure, decision] of [
      ["published-hash", null, "ready"],
      ["local-hash", null, "waiting"],
      ["bad-hash", "MANIFEST_ICON", "revision-needed"],
    ] as const) {
      const observation = {
        contextId: "ctx", workingRevision: "current", mainRevision: "protected",
        working: makeManifest("working", digest, failure),
        published: makeManifest("published", "published-hash", null),
      };
      const run = (await loader.load("skills/vibestudio-workflows/runWorkflow.nl", {
        services: { extensionDesignRead: { async inspect(id: string) {
          reads.push(id);
          return observation;
        } } },
      })) as (input: unknown) => Promise<unknown>;
      stagedCalls.length = 0;
      await expect(run({ goal, work: [{
        kind: "domain", domain: "unitDesign", operation: "reviewWorkspaceUnit", input,
      }] })).resolves.toMatchObject({
        results: [{ report: {
          decision,
          evidenceIds: [observation.working.receipt.id, observation.published.receipt.id],
          components: [
            { finding: failure ?? "manifest-verified", evidenceIds: [observation.working.receipt.id] },
            { finding: "manifest-verified", evidenceIds: [observation.published.receipt.id] },
            { finding: decision === "ready" ? "manifest-published" : "manifest-not-published" },
          ],
        } }],
      });
      expect(reads.splice(0)).toEqual([operationId]);
      expect(stagedCalls.splice(0)).toEqual([
        "runWorkflow", "reviewWorkspaceUnit", "reviewLiveExtensionDesign", "readExtensionDesign",
        "reviewExtension", "inspectManifest", "reviewExtension", "inspectManifest",
        "reviewManifestPublication", "combineWork",
      ]);
    }
    runReference = false;
  }
  if (description.functions.some(({ name }) => name === "reviewDeviceAndTerminal")) {
    runReference = true;
    const goal = "Review the origin and completeness of the retained result.";
    for (const [foreign, truncated, status, code] of [
      [false, false, "ready", "execution-succeeded"],
      [false, true, "attention", "success-output-truncated"],
      [true, false, "blocked", "result-target-mismatch"],
    ] as const) {
      const makeResult = (operationId: string) => ({
        contextId: "ctx", operationId,
        plan: { receipt: `${operationId}:plan`, checks: [{
          id: "evidence", purpose: "Read the marker", prerequisites: [], mode: "argv" as const,
        }] },
        result: {
          receipt: `${operationId}:check:evidence`, id: "evidence", status: "complete" as const,
          exitCode: 0, timedOut: false, truncated, stdout: "ready", stderr: "notice",
        },
      });
      const assigned = makeResult("assigned");
      const retained = foreign ? makeResult("neighbor") : assigned;
      const bound = bindTerminalReceiptReview({ goal, assigned, retained });
      const run = (await loader.load("skills/vibestudio-workflows/runWorkflow.nl", {
        services: bound.services,
      })) as (input: unknown) => Promise<unknown>;
      stagedCalls.length = 0;
      await expect(run({goal, work: [{
        kind: "domain", domain: "deviceAndTerminal", operation: "reviewDeviceAndTerminal", input: bound.request,
      }]})).resolves.toMatchObject({
        results: [{report: {status, findings: [{
          code, evidenceIds: foreign ? [assigned.operationId, retained.result.receipt] : [retained.result.receipt],
        }]}}],
      });
      expect(stagedCalls.splice(0)).toEqual([
        "runWorkflow", "reviewDeviceAndTerminal", "reviewLiveTerminal", "readTerminalEvidence",
        "reviewTerminal", "inspectInvocation", "inspectExecution",
      ]);
    }
    runReference = false;
  }
  if (description.functions.some(({ name }) => name === "reviewRetainedFailure")) {
    runReference = true;
    const request = {
      goal: "Diagnose the assigned failed test",
      operationId: "owned-record",
      runId: "assigned-run",
      testName: "assigned-test",
    };
    const packet = {
      runId: request.runId,
      failure: {
        name: request.testName,
        failure: { phase: "validation", error: { name: "Error", message: "Cannot read digest" } },
        validationFailure: { validator: "harness" },
        validationReason: "Cannot read digest",
        sessionError: null,
        finalAgentMessage: null,
        invocations: [],
        toolFailures: [],
        cleanupErrors: [],
        cleanupFailures: [],
        channelDeliveryLatency: null,
        workspaceRepoFixture: null,
        orchestration: null,
        likelyIssue: "",
      },
    };
    const run = (await loader.load(
      "skills/vibestudio-workflows/runWorkflow.nl",
      { services: { retainedTestFailure: {
        inspect: async (id: string) => {
          expect(id).toBe(request.operationId);
          return structuredClone(packet);
        },
      } } },
    )) as (request: unknown) => Promise<unknown>;
    const workflow = {
      goal: request.goal,
      work: [{kind:"domain",domain:"testReview",operation:"reviewRetainedFailure",input:request}],
    };
    await expect(run(workflow)).resolves.toMatchObject({
      remaining: [],
      results: [{report:{status:"triaged",runId:request.runId,triage:{
        class:"validator",evidence:[{source:"validator-error",text:"the harness validator threw"},
          {source:"validation",text:"Cannot read digest"},
          {source:"phase",text:"validation: Error: Cannot read digest"}],
      }}}],
    });
    expect(stagedCalls.splice(0)).toEqual([
      "runWorkflow","reviewRetainedFailure","readRetainedFailure","reviewSystemTest","triageFailure",
    ]);
    packet.runId = "different-run";
    await expect(run(workflow)).resolves.toMatchObject({results:[{report:{status:"unavailable",triage:null}}]});
    expect(stagedCalls.splice(0)).toEqual(["runWorkflow","reviewRetainedFailure","readRetainedFailure"]);
    runReference = false;
  }
  if (description.functions.some(({ name }) => name === "diagnoseGitHubOperation")) {
    runReference = true;
    const status = { stage: "needs-token", connected: false, verified: false };
    for (const [goal, level, interactive, expected] of [
      ["Verify a GitHub remote", null, false, null],
      ["Diagnose a request to create a GitHub repository", "publish", true, "offer-setup"],
      ["Diagnose a GitHub Pages publication", "publish-pages", false, "interactive-required"],
    ] as const) {
      const request = { goal, operationId: "diagnosis" };
      const observation = {
        operationId: "diagnosis",
        failure: level ? "No active GitHub credential is available." : "Invalid GitHub remote URL for local verification.",
        setup: level ? { goal, operationId: "setup", interactive } : null,
      };
      const reads: string[] = [];
      const run = (await loader.load("skills/vibestudio-workflows/runWorkflow.nl", {
        services: {
          githubDiagnosisRead: { async inspect(id: string) {
            expect(id).toBe("diagnosis");
            reads.push("diagnosis");
            return observation;
          } },
          githubSetupRead: { async inspect(id: string) {
            expect(id).toBe("setup");
            reads.push("setup");
            return status;
          } },
          githubSetupRoute: { async resolve(id: string, accessLevel: string) {
            expect([id, accessLevel]).toEqual(["setup", level]);
            reads.push("route");
            return { action: "render-setup", accessLevel, next: "open setup", reason: "connect GitHub" };
          } },
        },
      })) as (input: unknown) => Promise<unknown>;
      stagedCalls.length = 0;
      await expect(run({ goal, work: [{
        kind: "domain", domain: "github", operation: "diagnoseGitHubOperation", input: request,
      }] })).resolves.toMatchObject({
        results: [{ report: {
          observation, diagnosis: { cause: level ? "not-connected" : "invalid-remote" },
          setup: level ? { accessLevel: level, handoff: expected } : null,
        } }],
      });
      expect(reads).toEqual(level ? ["diagnosis", "setup", "route"] : ["diagnosis"]);
      expect(stagedCalls.splice(0)).toEqual([
        "runWorkflow","diagnoseGitHubOperation","readGitHubDiagnosis","troubleshootGithub","cause",
        ...(level ? ["reviewGitHubSetup","readGitHubSetup","accessLevelFor","resolveGitHubRoute","chooseSetupHandoff"] : []),
      ]);
    }
    runReference = false;
  }
  if (description.functions.some(({ name }) => name === "reviewGitHubSetup")) {
    runReference = true;
    const status = { stage: "needs-token", connected: false, verified: false };
    for (const [goal, interactive, level, handoff] of [
      ["Publish my website on GitHub Pages", true, "publish-pages", "offer-setup"],
      ["Read the open pull requests", false, "read-only", "interactive-required"],
    ] as const) {
      const observed: string[] = [];
      const route = {
        action: "render-setup",
        accessLevel: level,
        next: "open the GitHub setup component",
        reason: "GitHub is disconnected",
      };
      const run = (await loader.load(
        "skills/vibestudio-workflows/runWorkflow.nl",
        { services: {
          githubSetupRead: {
            inspect: async (id: string) => {
              expect(id).toBe("github-assignment");
              observed.push("inspect");
              return status;
            },
          },
          githubSetupRoute: {
            resolve: async (id: string, needed: string) => {
              expect(id).toBe("github-assignment");
              expect(needed).toBe(level);
              observed.push("resolve");
              return route;
            },
          },
        } },
      )) as (request: unknown) => Promise<unknown>;
      await expect(run({
        goal,
        work: [{kind:"domain",domain:"github",operation:"reviewGitHubSetup",input:{goal,interactive,operationId:"github-assignment"}}],
      })).resolves.toMatchObject({
        remaining: [], results: [{report:{status,accessLevel:level,route,handoff}}],
      });
      expect(observed).toEqual(["inspect", "resolve"]);
      expect(stagedCalls.splice(0)).toEqual([
        "runWorkflow", "reviewGitHubSetup", "readGitHubSetup", "accessLevelFor",
        "resolveGitHubRoute", "chooseSetupHandoff",
      ]);
    }
    runReference = false;
  }
  if (description.functions.some(({ name }) => name === "reviewRemoteRoute")) {
    runReference = true;
    const observed = {serverId:"actual-server",workspaceId:"actual-workspace",bootId:"boot"};
    const run = (await loader.load(
      "skills/vibestudio-workflows/runWorkflow.nl",
      {services:{remoteGatewayIdentity:{observe: async (id: string) => {
        expect(id).toBe("assigned-gateway");
        return structuredClone(observed);
      }}}},
    )) as (request: unknown) => Promise<unknown>;
    for (const [serverId, workspaceId, verdict, layer, next] of [
      ["actual-server", "actual-workspace", "verified", "healthy", "accept-identity"],
      ["actual-server", "old-workspace", "workspace-mismatch", "workspace-routing", "refresh-workspace-reach"],
      ["foreign-server", "old-workspace", "server-mismatch", "device-credential", "verify-server-assignment"],
    ] as const) {
      const request = {goal:"Review the opened gateway",operationId:"assigned-gateway",serverId,workspaceId};
      await expect(run({
        goal: request.goal,
        work: [{kind:"domain",domain:"remoteAccess",operation:"reviewRemoteRoute",input:request}],
      })).resolves.toMatchObject({
        remaining: [], results: [{report:{observed,verdict,layer,next}}],
      });
      expect(stagedCalls.splice(0)).toEqual([
        "runWorkflow","reviewRemoteRoute","readGatewayIdentity","remoteLayer","routeHandoff",
      ]);
    }
    runReference = false;
  }
  const commissioning = join(templateRoot, "system", "skills", "remote-commission-fixtures");
  if ((await stat(commissioning).catch(() => null))?.isDirectory()) {
    const [{ remoteCommissionWorlds }, { createRemoteCommissionFixture }, { remoteCommissionReferenceSteps }] =
      await Promise.all([
        import(join(commissioning, "worlds.ts")),
        import(join(commissioning, "fixture.ts")),
        import(join(commissioning, "reference.ts")),
      ]);
    const { runWorkflow: _root, ...remoteStages } = remoteCommissionReferenceSteps;
    Object.assign(referenceSteps, remoteStages);
    runReference = true;
    for (const world of remoteCommissionWorlds) {
      const { bindings, verify } = createRemoteCommissionFixture(world);
      const run = (await loader.load("skills/vibestudio-workflows/runWorkflow.nl", {
        services: bindings,
      })) as (request: unknown) => Promise<{
        results: { operation: string; report: unknown }[];
        remaining: unknown[];
      }>;
      const result = await run(world.request);
      expect(result.remaining, world.id).toEqual([]);
      expect(result.results, world.id).toHaveLength(1);
      expect(result.results[0]?.operation, world.id).toBe(world.operation);
      expect(verify(result.results[0]?.report), world.id).toBe(true);
    }
    runReference = false;
    stagedCalls.length = 0;
  }
  const rosterCalls: string[] = [];
  const roster = (await loader.load(
    "skills/vibestudio-workflows/runWorkflow.nl",
    {
      services: {
        channelAgentRead: {
          read: async (request: { channelId: string }) => {
            rosterCalls.push(request.channelId);
            return {
              state: request.channelId === "oncall" ? "conflict" : "absent",
              participantId: null,
            };
          },
        },
      },
    },
  )) as {
    domains: {
      channelAgent: { runRosterPlan: (input: unknown) => Promise<unknown> };
    };
  };
  const scope = {
    handle: "scribe",
    contextId: "assignment",
    goal: "Check scribe membership",
    options: null,
  };
  runReference = true;
  await expect(
    roster.domains.channelAgent.runRosterPlan({
      goal: "Check both channels and hold writes following a conflict",
      steps: [
        {
          id: "first",
          request: { ...scope, channelId: "oncall", action: "inspect" },
        },
        {
          id: "second",
          request: { ...scope, channelId: "oncall", action: "detach" },
        },
        {
          id: "third",
          request: { ...scope, channelId: "review", action: "inspect" },
        },
      ],
    }),
  ).resolves.toEqual({
    findings: [
      {
        id: "first",
        result: { status: "held", state: "conflict", participantId: null },
        blockedBy: null,
      },
      { id: "second", result: null, blockedBy: "first" },
      {
        id: "third",
        result: { status: "observed", state: "absent", participantId: null },
        blockedBy: null,
      },
    ],
  });
  expect(rosterCalls).toEqual(["oncall", "review"]);
  stagedCalls.length = 0;
  runReference = false;
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
  for (const world of approvalVisibilityWorlds) {
    const catalog = cases.find((scenario) => scenario.id === world.id);
    expect(catalog?.request?.work[0]?.input, world.id).toEqual(world.request);
    stagedCalls.length = 0;
    const value = (await program(catalog?.request)) as {
      results: { report: unknown }[];
      remaining: string[];
    };
    expect(value.remaining, world.id).toEqual([]);
    expect(value.results, world.id).toHaveLength(1);
    expect(
      verifyApprovalVisibility(world, value.results[0]?.report).passed,
      world.id,
    ).toBe(true);
    expect(stagedCalls.slice(0, 3), world.id).toEqual([
      "runWorkflow",
      "reviewApprovalQueues",
      "selectApprovalSurfaces",
    ]);
    expect(stagedCalls.slice(-2), world.id).toEqual([
      "summarizeApprovalVisibility",
      "locatePendingApproval",
    ]);
  }
  const approvalReadback = process.env.VIBESTUDIO_APPROVAL_VISIBILITY_SMOKE_JSON;
  if (approvalReadback) {
    const world = JSON.parse(await readFile(approvalReadback, "utf8")) as
      (typeof approvalVisibilityWorlds)[number];
    const report = await program({
      goal: world.request.goal,
      work: [{
        kind: "domain",
        domain: "capabilities",
        operation: "reviewApprovalQueues",
        input: world.request,
      }],
    }) as { results: { report: unknown }[]; remaining: string[] };
    expect(report.remaining).toEqual([]);
    expect(report.results).toHaveLength(1);
    expect(verifyApprovalVisibility(world, report.results[0]?.report).passed).toBe(true);
  }
  for (const world of localReviewerWorlds) {
    const catalog = cases.find((scenario) => scenario.id === world.id);
    expect(catalog?.request, world.id).toBeDefined();
    const assignment = world.request.work[0].input;
    const effects: string[] = [];
    let participantId: string | null = null;
    const services = bindChannelMembership(assignment, {
      async roster() {
        return participantId
          ? { state: "member", participantId }
          : { state: "absent", participantId: null };
      },
      async add(options) {
        expect(options).toEqual(assignment.options);
        effects.push("attach");
        participantId = "verified-review-worker";
        return { outcome: "acknowledged", participantId };
      },
      async remove() {
        throw new Error("Local reviewer tasks do not remove an agent");
      },
    });
    const localReviewer = (await loader.load(
      "skills/vibestudio-workflows/runWorkflow.nl",
      {
        services: {
          ...services,
          localModelTaskInventory: {
            inspect: async (ref: string) =>
              ref === world.inventory.ref ? world.inventory : null,
          },
        },
      },
    )) as (input: unknown) => Promise<unknown>;
    stagedCalls.length = 0;
    await expect(
      localReviewer(catalog?.request),
      world.id,
    ).resolves.toMatchObject({
      results: [
        {
          domain: "localModel",
          report: { disposition: world.expected.disposition },
        },
        ...(world.expected.attach
          ? [
              {
                domain: "channelAgent",
                report: {
                  status: "applied",
                  participantId: "verified-review-worker",
                },
              },
            ]
          : []),
      ],
      remaining: world.expected.attach
        ? []
        : ["Selected model is not eligible"],
    });
    expect(effects, world.id).toEqual(world.expected.attach ? ["attach"] : []);
    if (world.expected.attach) {
      expect(stagedCalls.indexOf("planDelegation")).toBeLessThan(
        stagedCalls.indexOf("attach"),
      );
    } else {
      expect(stagedCalls).not.toContain("manageChannelAgent");
    }
  }
}, 120_000);

it("runs the mounted assigned web brief through the existing research tree", async () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const quote = "Widget releases require editorial review.";
  const url = "https://source.example/notes";
  const commands: Record<string, string> = {
    runWorkflow: `
      const item = request.work[0];
      const report = await domains.webResearch.writeAssignedBrief(item.input);
      return {results: [{kind: item.kind, domain: item.domain, operation: item.operation, report}], remaining: []};
    `,
    writeAssignedBrief:
      "return await researchBrief(request.goal, request.sources, request.retrievedAt);",
    researchBrief: "return await brief(question, sources, retrievedAt);",
    findEvidence: `return {claim: ${JSON.stringify(quote)}, quote: ${JSON.stringify(quote)}};`,
    writeBrief: `return [{text: ${JSON.stringify(quote)}, cites: [claims[0].id]}];`,
  };
  const calls: string[] = [];
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      const name = session.lam.functionName ?? "";
      calls.push(name);
      const code = commands[name];
      if (!code) throw new Error(`Unexpected research call ${name}`);
      const action = await session.applyAsync("eval", { code, finish: true });
      if (action.kind === "rejected" || action.kind === "error")
        throw new Error(action.text);
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
  const seen: unknown[] = [];
  const run = (await loader.load("skills/vibestudio-workflows/runWorkflow.nl", {
    services: {
      web: {
        search: async () => {
          throw new Error("An assigned source skips search");
        },
        fetch: async (input: unknown) => {
          seen.push(input);
          return {
            url,
            title: "Notes",
            digest: "example",
            size: quote.length,
            head: quote,
            headBytes: quote.length,
            truncated: false,
          };
        },
        read: async () => {
          throw new Error("The head contains the complete page");
        },
      },
    },
  })) as (input: unknown) => Promise<unknown>;
  const question = "What does a widget release require?";
  await expect(
    run({
      goal: question,
      work: [
        {
          kind: "domain",
          domain: "webResearch",
          operation: "writeAssignedBrief",
          input: {
            goal: question,
            sources: [url],
            retrievedAt: Date.UTC(2026, 10, 19),
          },
        },
      ],
    }),
  ).resolves.toMatchObject({
    results: [
      {
        domain: "webResearch",
        operation: "writeAssignedBrief",
        report: {
          question,
          status: "answered",
          statements: [
            { text: quote, cites: [{ url, quote, retrieved: "2026-11-19" }] },
          ],
        },
      },
    ],
    remaining: [],
  });
  expect(calls).toEqual([
    "runWorkflow",
    "writeAssignedBrief",
    "researchBrief",
    "findEvidence",
    "writeBrief",
  ]);
  expect(seen).toEqual([{ url, session: "public" }]);
});

it("calls nested semantic VCS delivery stages with one exact candidate read", async () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const snapshot = {
    contextId: "ctx-review",
    current: true,
    clean: false,
    relation: "at",
    working: {
      kind: "application",
      applicationId: "application:edit-candidate",
    },
    committed: { kind: "event", eventId: "workspace-event:main" },
    protectedMain: { kind: "event", eventId: "workspace-event:main" },
    integrations: [],
    file: {
      path: "retries.ts",
      working: {
        fileId: "file:retries",
        hash: "changed",
        mode: 420,
        excerpt: "export const retries = 1;",
        truncated: false,
      },
      committed: {
        fileId: "file:retries",
        hash: "original",
        mode: 420,
        excerpt: "export const retries = 3;",
        truncated: false,
      },
      protectedMain: {
        fileId: "file:retries",
        hash: "original",
        mode: 420,
        excerpt: "export const retries = 3;",
        truncated: false,
      },
      hasLocalDifference: true,
      hasDeliveryDifference: true,
    },
  };
  const seen: string[] = [];
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      const name = session.lam.functionName!;
      seen.push(name);
      expect(Object.keys(session.availableServices())).toEqual(
        name === "reviewVcsDelivery" ? ["vcsDeliveryRead"] : [],
      );
      const commands: Record<string, string> = {
        runWorkflow: `
          const report=await domains.vcsDelivery.reviewVcsDelivery(request.work[0].input);
          return {results:[{kind:"domain",domain:"vcsDelivery",operation:"reviewVcsDelivery",report}],remaining:[]};
        `,
        reviewVcsDelivery: `
          const snapshot=await vcsDeliveryRead.observe(request.operationId);
          if(!snapshot.current) return {snapshot,chain:null,review:null,next:"refresh"};
          const chain=await inspectChain(snapshot);
          const review=await reviewChange(request.goal,snapshot.file);
          return {snapshot,chain,review,next:await chooseDeliveryStep(snapshot,chain,review)};
        `,
        inspectChain: `
          return {local:await describeLocalChain(snapshot.clean,snapshot.file.hasLocalDifference),
            main:await reviewIntegration(snapshot.relation,snapshot.integrations)};
        `,
        describeLocalChain:
          'return {state:clean?"clean":"uncommitted",summary:fileChanged?"Assigned file is edited.":"Assigned file is unchanged."};',
        reviewIntegration:
          'return {state:relation==="at"?"current":"integrate",summary:"Checked protected main."};',
        reviewChange: `
          const interpretation=await interpretFile(goal,file);
          return {...interpretation,checks:await planChecks(file.path,interpretation)};
        `,
        interpretFile:
          'return {effect:file.working.excerpt,risks:["Earlier retry exhaustion"]};',
        planChecks: 'return ["Exercise a transient failure under "+path];',
        chooseDeliveryStep:
          'return chain.local.state==="uncommitted"?"verify-then-commit":"already-current";',
      };
      const code = commands[name];
      if (!code) throw new Error("Unexpected stage " + name);
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
      vcsDeliveryRead: {
        observe: async (id: string) => {
          reads.push(id);
          return snapshot;
        },
      },
    },
  })) as (request: unknown) => Promise<unknown>;
  const input = {
    goal: "Review reducing retries",
    operationId: "review-assignment",
    repository: "packages/retry",
    path: "retries.ts",
  };
  const request = {
    goal: input.goal,
    work: [
      {
        kind: "domain",
        domain: "vcsDelivery",
        operation: "reviewVcsDelivery",
        input,
      },
    ],
  };
  await expect(run(request)).resolves.toMatchObject({
    results: [
      {
        report: {
          snapshot,
          chain: {
            local: { state: "uncommitted" },
            main: { state: "current" },
          },
          review: {
            effect: "export const retries = 1;",
            checks: ["Exercise a transient failure under retries.ts"],
          },
          next: "verify-then-commit",
        },
      },
    ],
  });
  expect(seen).toEqual([
    "runWorkflow",
    "reviewVcsDelivery",
    "inspectChain",
    "describeLocalChain",
    "reviewIntegration",
    "reviewChange",
    "interpretFile",
    "planChecks",
    "chooseDeliveryStep",
  ]);
  expect(reads).toEqual([input.operationId]);

  seen.length = 0;
  snapshot.current = false;
  await expect(run(request)).resolves.toMatchObject({
    results: [
      { report: { snapshot, chain: null, review: null, next: "refresh" } },
    ],
  });
  expect(seen).toEqual(["runWorkflow", "reviewVcsDelivery"]);
});

it("composes the chat delivery audit behind separately scoped reads", async () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const scopedServices: Record<string, string[]> = {};
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      const name = session.lam.functionName!;
      scopedServices[name] = Object.keys(session.availableServices());
      const commands: Record<string, string> = {
        runWorkflow: `
          const item=request.work[0];
          const report=item.operation==="reviewConversation"
            ? await domains.conversation.reviewConversation(item.input)
            : await domains.conversation.reviewChatDelivery(item.input);
          return {results:[{kind:"domain",domain:item.domain,operation:item.operation,report}],remaining:[]};
        `,
        reviewConversation: `
          const {goal,operationId,contextId,panelId}=request;
          const chat=await reviewChatDelivery({goal,operationId,contextId,panelId});
          const next=await chooseChatHandoff(chat);
          return {kind:"chat-handoff",basis:chat.delivery.observation.channelId,chat,next,
            blockers:next==="ready"?[]:[chat.verdict],ready:next==="ready"};
        `,
        chooseChatHandoff: `
          if(chat.verdict==="history-unverified") return "trace-original-receipt";
          if(chat.verdict==="panel-mismatch") return "reopen-assigned-chat";
          return chat.verdict==="verified"?"ready":"inspect-renderer";
        `,
        reviewChatDelivery: `
          const delivery=await reviewDeliveryHistory({goal:request.goal,operationId:request.operationId});
          if(!delivery.verified) return {delivery,panel:null,verdict:"history-unverified"};
          const panel=await inspectPanel(request.panelId);
          if(!await checkPanel(request,delivery.observation.channelId,panel)) return {delivery,panel,verdict:"panel-mismatch"};
          return {delivery,panel,verdict:await checkMessage(delivery.observation.retained[0],panel.messages)};
        `,
        reviewDeliveryHistory: `
          const observation=await deliveryHistory.inspect(request.operationId);
          const origin=await checkOrigin(observation);
          const consumer=origin==="matched" ? await compareConsumer(observation.retained[0],observation.rendered) : "unreviewed";
          return {observation,origin,consumer,verified:origin==="matched"&&consumer==="matched"};
        `,
        checkOrigin: `
          if(observation.receipt.channelId!==observation.channelId) return "foreign-channel";
          return await matchReceipt(observation.receipt,observation.retained[0]);
        `,
        matchReceipt:
          'return receipt.messageId===row.messageId&&receipt.senderId===row.senderId&&row.envelopeId&&row.sequence>0 ? "matched" : "receipt-mismatch";',
        compareConsumer:
          'return await sameMessage(retained,rendered[0]) ? "matched" : "divergent";',
        inspectPanel: "return await chatDeliveryPanel.inspect(panelId);",
        checkPanel: `
          return panel.panelId===request.panelId&&panel.contextId===request.contextId&&
            panel.channelId===channelId&&panel.phase==="ready"&&panel.source==="panels/chat";
        `,
        checkMessage: "return await compareVisibleMessage(retained,messages);",
      };
      const response = await session.applyAsync("eval", {
        code: commands[name]!,
      });
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
    runTask: (run, task) => runtime.run(run, task),
  });
  const goal = "Check whether the workshop note appears in the assigned chat";
  const row = {
    messageId: "message",
    senderId: "sender",
    text: "Doors open at 9",
  };
  const observation = {
    channelId: "channel",
    receipt: {
      channelId: "channel",
      messageId: row.messageId,
      senderId: row.senderId,
    },
    retained: [{ ...row, envelopeId: "envelope", sequence: 2 }],
    rendered: [row],
  };
  const actualMessage = { messageId: row.messageId, text: row.text };
  const panel = {
    contextId: "branch",
    panelId: "panel",
    channelId: "channel",
    source: "panels/chat",
    phase: "ready",
    messages: [actualMessage],
  };
  const reads: string[] = [];
  const run = (await loader.load("skills/vibestudio-workflows/runWorkflow.nl", {
    services: {
      deliveryHistory: {
        inspect: async (id: string) => {
          reads.push(id);
          return structuredClone(observation);
        },
      },
      chatDeliveryPanel: {
        inspect: async (id: string) => {
          reads.push(id);
          return structuredClone(panel);
        },
      },
    },
  })) as (input: unknown) => Promise<unknown>;
  const request = {
    goal,
    work: [
      {
        kind: "domain",
        domain: "conversation",
        operation: "reviewChatDelivery",
        input: {
          goal,
          operationId: "receipt",
          panelId: "panel",
          contextId: "branch",
        },
      },
    ],
  };
  const result = (verdict: string) => ({
    remaining: [],
    results: [
      {
        kind: "domain",
        domain: "conversation",
        operation: "reviewChatDelivery",
        report: { verdict },
      },
    ],
  });

  await expect(run(request)).resolves.toMatchObject(result("verified"));
  expect(reads.splice(0)).toEqual(["receipt", "panel"]);
  expect(scopedServices.reviewChatDelivery).toEqual([]);
  expect(scopedServices.reviewDeliveryHistory).toEqual(["deliveryHistory"]);
  expect(scopedServices.inspectPanel).toEqual(["chatDeliveryPanel"]);
  expect(scopedServices.checkMessage).toEqual([]);

  const handoff = {
    goal,
    work: [{
      ...request.work[0],
      operation: "reviewConversation",
      input: { kind: "chat-handoff", ...request.work[0]!.input },
    }],
  };
  const handoffResult = (next: string, blockers: string[]) => ({
    remaining: [],
    results: [{
      operation: "reviewConversation",
      report: { kind: "chat-handoff", basis: "channel", next, blockers, ready: next === "ready" },
    }],
  });
  await expect(run(handoff)).resolves.toMatchObject(handoffResult("ready", []));
  expect(reads.splice(0)).toEqual(["receipt", "panel"]);
  expect(scopedServices.reviewConversation).toEqual([]);
  expect(scopedServices.chooseChatHandoff).toEqual([]);

  panel.messages = [{ ...actualMessage, messageId: "other-message" }];
  await expect(run(request)).resolves.toMatchObject(result("message-missing"));
  panel.messages = [actualMessage, actualMessage];
  await expect(run(request)).resolves.toMatchObject(result("message-repeated"));
  panel.messages = [{ ...actualMessage, text: "Doors open at 10" }];
  await expect(run(request)).resolves.toMatchObject(
    result("message-divergent"),
  );
  await expect(run(handoff)).resolves.toMatchObject(
    handoffResult("inspect-renderer", ["message-divergent"]),
  );
  panel.channelId = "wrong-channel";
  await expect(run(request)).resolves.toMatchObject(result("panel-mismatch"));
  reads.length = 0;
  await expect(run(handoff)).resolves.toMatchObject(
    handoffResult("reopen-assigned-chat", ["panel-mismatch"]),
  );
  expect(reads.splice(0)).toEqual(["receipt", "panel"]);

  observation.receipt.channelId = "another-channel";
  reads.length = 0;
  await expect(run(request)).resolves.toMatchObject(
    result("history-unverified"),
  );
  expect(reads).toEqual(["receipt"]);
  reads.length = 0;
  await expect(run(handoff)).resolves.toMatchObject(
    handoffResult("trace-original-receipt", ["history-unverified"]),
  );
  expect(reads).toEqual(["receipt"]);
}, 60_000);

it("reuses the mounted automation planner and rejects a stale handoff", async () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const called: string[] = [];
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      const name = session.lam.functionName!;
      called.push(name);
      const services = Object.keys(session.availableServices());
      expect(services).toEqual(
        name === "observePlanningState" ? ["automationPlanning"] : [],
      );
      const actions: Record<string, string> = {
        runWorkflow: `
          const item=request.work[0];
          const report=await domains.automation.reviewAssignedAutomation(item.input);
          return {results:[{kind:"domain",domain:item.domain,operation:item.operation,report}],remaining:[]};
        `,
        reviewAssignedAutomation: `
          const before=await observePlanningState(request.operationId);
          const args=await projectPlanningRequest(request,before);
          const plan=await prepareAutomation(args);
          if(plan.kind==="hold"||plan.kind==="launch") return {status:"held",plan,before,after:null};
          const after=await observePlanningState(request.operationId);
          return {status:await checkHandoff(plan,before,after),plan,before,after};
        `,
        observePlanningState:
          "return await automationPlanning.inspect(operationId);",
        prepareAutomation: `
          if(await classifyIntent(request.goal)!=="control") throw new Error("Wrong path");
          return await planControl(request);
        `,
        classifyIntent: 'return "control";',
        planControl: `
          const selected=await resolveVisible(request.goal,request.visible);
          if(selected.kind==="hold") return selected;
          const action=await chooseControl(request.goal,selected.automation.state);
          return {kind:"control",automationId:selected.automation.id,action};
        `,
        resolveVisible: `
          if(visible.some(row=>"revisionDigest" in row)) throw new Error("Planner got extra revision metadata");
          return visible.length===1
            ? {kind:"found",automation:visible[0]} : {kind:"hold",reason:"Choose the monitor"};
        `,
        chooseControl: 'return "resume";',
        checkHandoff: `
          const comparison=await checkSnapshot(plan,before,after);
          return comparison==="matching" ? "ready" : (comparison==="different" ? "changed" : "held");
        `,
      };
      const result = await session.applyAsync("eval", { code: actions[name]! });
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
    runTask: (run, task) => runtime.run(run, task),
  });
  const mission = {
    id: "assigned",
    name: "Review",
    state: "paused",
    revisionDigest: "one",
    latestRun: null,
  };
  let mode = "stable";
  let reads = 0;
  const run = (await loader.load("skills/vibestudio-workflows/runWorkflow.nl", {
    services: {
      automationPlanning: {
        inspect: async (id: string) => {
          expect(id).toBe("planning-window");
          reads++;
          return {
            visible:
              mode === "ambiguous"
                ? [mission, { ...mission, id: "duplicate-name" }]
                : [
                    {
                      ...mission,
                      revisionDigest:
                        mode === "edited" && reads === 2 ? "two" : "one",
                    },
                  ],
          };
        },
      },
    },
  })) as (request: unknown) => Promise<unknown>;
  const goal = "Review a plan to resume the Review monitor";
  const request = {
    goal,
    work: [
      {
        kind: "domain",
        domain: "automation",
        operation: "reviewAssignedAutomation",
        input: {
          goal,
          operationId: "planning-window",
          timezone: "UTC",
          now: "2026-11-20T00:00:00Z",
        },
      },
    ],
  };
  const report = (status: string) => ({
    results: [{ report: { status } }],
    remaining: [],
  });

  await expect(run(request)).resolves.toMatchObject(report("ready"));
  expect(reads).toBe(2);
  expect(called.filter((name) => name !== "runWorkflow")).toEqual([
    "reviewAssignedAutomation",
    "observePlanningState",
    "prepareAutomation",
    "classifyIntent",
    "planControl",
    "resolveVisible",
    "chooseControl",
    "observePlanningState",
    "checkHandoff",
  ]);

  mode = "edited";
  reads = 0;
  await expect(run(request)).resolves.toMatchObject(report("changed"));
  expect(reads).toBe(2);

  mode = "ambiguous";
  reads = 0;
  await expect(run(request)).resolves.toMatchObject(report("held"));
  expect(reads).toBe(1);
}, 60_000);

it("reviews the native template plan through the mounted publication tree", async () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const calls: string[] = [];
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      const name = session.lam.functionName!;
      calls.push(name);
      expect(Object.keys(session.availableServices())).toEqual(
        name === "readAuthoringPlan" ? ["templateAuthoringRead"] : [],
      );
      const actions: Record<string, string> = {
        runWorkflow: `
          const item=request.work[0];
          const report=await domains.templates.reviewTemplateRelease(item.input);
          return {results:[{kind:"domain",domain:item.domain,operation:item.operation,report}],remaining:[]};
        `,
        reviewTemplateRelease: `
          const plan=await readAuthoringPlan(request.operationId);
          const input=await publicationReviewInput(request,plan);
          return {plan,review:await reviewTemplate(input)};
        `,
        readAuthoringPlan:
          "return await templateAuthoringRead.inspect(operationId);",
        reviewTemplate: "return await reviewPublication(request);",
        reviewPublication: `
          if(request.receipt!==null) throw new Error("Authoring inspection cannot assert publication");
          return {kind:"publication",next:await confirmInspection(request),basis:request.currentFingerprint};
        `,
        confirmInspection: `
          if(request.inspectedFingerprint!==request.currentFingerprint) return "reinspect";
          if(request.missingParts.length) return "include-required-parts";
          return request.destination&&request.version ? "ready-to-publish" : "request-target";
        `,
      };
      const result = await session.applyAsync("eval", { code: actions[name]! });
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
    runTask: (run, task) => runtime.run(run, task),
  });
  const plan = {
    mainEventId: "main",
    name: "Review package",
    requestedParts: ["packages/planner"],
    includedParts: ["packages/planner", "workers/report"],
    requiredParts: ["workers/report"],
    manifestDigest: "manifest",
    fingerprint: "current",
  };
  let reads = 0;
  const run = (await loader.load("skills/vibestudio-workflows/runWorkflow.nl", {
    services: {
      templateAuthoringRead: {
        inspect: async (id: string) => {
          expect(id).toBe("assignment");
          reads++;
          return structuredClone(plan);
        },
      },
    },
  })) as (request: unknown) => Promise<unknown>;
  const goal = "Check whether our proposed template release can proceed";
  const input = {
    goal,
    operationId: "assignment",
    reviewedFingerprint: "current",
    acknowledgedParts: ["workers/report"],
    destination: "review/package",
    version: "1.0.0",
  };
  const invoke = () =>
    run({
      goal,
      work: [
        {
          kind: "domain",
          domain: "templates",
          operation: "reviewTemplateRelease",
          input,
        },
      ],
    });
  const result = (next: string) => ({
    remaining: [],
    results: [
      {
        report: {
          plan,
          review: { kind: "publication", next, basis: plan.fingerprint },
        },
      },
    ],
  });

  await expect(invoke()).resolves.toMatchObject(result("ready-to-publish"));
  expect(calls).toEqual([
    "runWorkflow",
    "reviewTemplateRelease",
    "readAuthoringPlan",
    "reviewTemplate",
    "reviewPublication",
    "confirmInspection",
  ]);
  input.acknowledgedParts = [];
  await expect(invoke()).resolves.toMatchObject(
    result("include-required-parts"),
  );
  input.reviewedFingerprint = "different";
  await expect(invoke()).resolves.toMatchObject(result("reinspect"));
  expect(reads).toBe(3);
}, 60_000);
