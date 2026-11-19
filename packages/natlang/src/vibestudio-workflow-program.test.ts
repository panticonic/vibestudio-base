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
import { membershipReference } from "../../../skills/channel-agent-membership-fixtures/reference.js";

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
      if (remote.domain === "remoteAccess") {
        const report = remote.operation === "deployRemoteServer"
          ? await domains.remoteAccess.deployRemoteServer(remote.input)
          : await domains.remoteAccess.openRemoteWorkspace(remote.input);
        return {results: [{kind: "domain", domain: remote.domain, operation: remote.operation, report}], remaining: []};
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
    deployRemoteServer: `
      const baseline = await observeBaseline(request.operationId);
      const decision = await decideDeployment(baseline);
      const evidenceIds = [baseline.receipt];
      if (decision !== "apply") return {status:decision, identity:null, evidenceIds};
      const attempt = await applyDeployment(baseline.receipt);
      evidenceIds.push(attempt.receipt);
      if (attempt.state !== "applied") {
        return {status:attempt.state === "failed" ? "installer-failed" : "baseline-changed", identity:null, evidenceIds};
      }
      const report = await checkReadiness(attempt.receipt);
      return {...report, evidenceIds:[...evidenceIds, ...report.evidenceIds]};
    `,
    observeBaseline: "return await remoteDeploymentRead.observe(operationId);",
    decideDeployment: `
      if (baseline.state === "unverified") return "baseline-unverified";
      if (baseline.intent === "update") return baseline.hasPriorIdentity ? "apply" : "update-needs-existing-server";
      return baseline.state === "ready" ? "already-running" : "apply";
    `,
    applyDeployment:
      "return await remoteDeploymentApply.apply(baselineReceipt);",
    checkReadiness: `
      const result = await observeReadiness(actionReceipt);
      return {status:await interpretReadiness(result), identity:result.identity, evidenceIds:[result.receipt]};
    `,
    observeReadiness:
      "return await remoteDeploymentVerify.verify(actionReceipt);",
    interpretReadiness: `
      return {verified:"deployment-ready", unready:"readiness-unverified",
        "unchanged-boot":"boot-unchanged", "identity-changed":"server-identity-changed"}[verified.state];
    `,
    openRemoteWorkspace: `
      const profile = await readAssignedProfile(request.operationId);
      const gate = await decideAdmission(profile);
      const evidenceIds = [profile.receipt];
      if (gate !== "pair" && gate !== "route") return {status:gate, workspaceId:null, evidenceIds};
      if (gate === "pair") {
        const paired = await pairAssignedProfile(profile.receipt);
        evidenceIds.push(paired.receipt);
        if (paired.state !== "paired") return {status:"pairing-failed", workspaceId:null, evidenceIds};
      }
      const report = await openAssignedRoute(evidenceIds.at(-1));
      return {...report, evidenceIds:[...evidenceIds, ...report.evidenceIds]};
    `,
    readAssignedProfile: "return await remoteAccessRead.observe(operationId);",
    decideAdmission: `
      if (observed.state === "foreign") return "different-profile";
      if (observed.state === "unusable") return "recover-profile";
      if (observed.state === "unpaired") return observed.inviteAssigned ? "pair" : "invite-required";
      return "route";
    `,
    pairAssignedProfile: "return await remoteAccessPair.pair(profileReceipt);",
    openAssignedRoute: `
      const route = await routeThroughHub(priorReceipt);
      if (route.state !== "routed") return {status:"route-unavailable", workspaceId:null, evidenceIds:[route.receipt]};
      const child = await observeChild(route.receipt);
      return {status:await interpretChild(child), workspaceId:child.workspaceId, evidenceIds:[route.receipt, child.receipt]};
    `,
    routeThroughHub: "return await remoteAccessRoute.select(priorReceipt);",
    observeChild: "return await remoteAccessVerify.verify(routeReceipt);",
    interpretChild: `
      if (child.state === "verified") return "workspace-ready";
      return child.state === "identity-mismatch" ? "child-identity-mismatch" : "child-unreachable";
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
        "deployRemoteServer",
      ],
    ],
    [
      join(templateRoot, "system-testing"),
      ["reviewSystemTest", "reviewSessionTest"],
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
  if (
    description.functions.some(({ name }) => name === "openRemoteWorkspace")
  ) {
    runReference = true;
    for (const example of [
      {
        profile: "unpaired",
        invite: true,
        pair: "paired",
        route: "routed",
        child: "verified",
        result: "workspace-ready",
        calls: ["read", "pair", "route", "child"],
      },
      {
        profile: "workspace",
        invite: false,
        pair: "paired",
        route: "routed",
        child: "identity-mismatch",
        result: "child-identity-mismatch",
        calls: ["read", "route", "child"],
      },
      {
        profile: "foreign",
        invite: true,
        pair: "paired",
        route: "routed",
        child: "verified",
        result: "different-profile",
        calls: ["read"],
      },
      {
        profile: "unpaired",
        invite: false,
        pair: "paired",
        route: "routed",
        child: "verified",
        result: "invite-required",
        calls: ["read"],
      },
      {
        profile: "unpaired",
        invite: true,
        pair: "failed",
        route: "routed",
        child: "verified",
        result: "pairing-failed",
        calls: ["read", "pair"],
      },
      {
        profile: "account",
        invite: false,
        pair: "paired",
        route: "failed",
        child: "verified",
        result: "route-unavailable",
        calls: ["read", "route"],
      },
    ]) {
      const observed: string[] = [];
      const remote = (await loader.load(
        "skills/vibestudio-workflows/runWorkflow.nl",
        {
          services: {
            remoteAccessRead: {
              observe: async (operationId: string) => {
                expect(operationId).toBe("assignment");
                observed.push("read");
                return {
                  receipt: "read",
                  state: example.profile,
                  inviteAssigned: example.invite,
                };
              },
            },
            remoteAccessPair: {
              pair: async (receipt: string) => {
                expect(receipt).toBe("read");
                observed.push("pair");
                return { receipt: "pair", state: example.pair };
              },
            },
            remoteAccessRoute: {
              select: async (receipt: string) => {
                expect(receipt).toBe(
                  example.calls.includes("pair") ? "pair" : "read",
                );
                observed.push("route");
                return { receipt: "route", state: example.route };
              },
            },
            remoteAccessVerify: {
              verify: async (receipt: string) => {
                expect(receipt).toBe("route");
                observed.push("child");
                return {
                  receipt: "child",
                  state: example.child,
                  workspaceId:
                    example.child === "verified" ? "workspace" : null,
                };
              },
            },
          },
        },
      )) as (request: unknown) => Promise<unknown>;
      await expect(
        remote({
          goal: "Open the assigned workspace",
          work: [
            {
              kind: "domain",
              domain: "remoteAccess",
              operation: "openRemoteWorkspace",
              input: { operationId: "assignment" },
            },
          ],
        }),
      ).resolves.toMatchObject({
        results: [
          {
            report: {
              status: example.result,
              workspaceId:
                example.result === "workspace-ready" ? "workspace" : null,
              evidenceIds: example.calls,
            },
          },
        ],
        remaining: [],
      });
      expect(observed).toEqual(example.calls);
    }
    stagedCalls.length = 0;
    runReference = false;
  }
  if (description.functions.some(({ name }) => name === "deployRemoteServer")) {
    runReference = true;
    const identity = {
      serverId: "hub",
      bootId: "new-boot",
      buildId: "build",
      workspaceId: "child",
    };
    for (const example of [
      {
        intent: "deploy",
        state: "inactive",
        applied: "applied",
        verdict: "verified",
        status: "deployment-ready",
        calls: ["baseline", "install", "verify"],
      },
      {
        intent: "deploy",
        state: "ready",
        applied: "applied",
        verdict: "verified",
        status: "already-running",
        calls: ["baseline"],
      },
      {
        intent: "update",
        state: "ready",
        applied: "applied",
        verdict: "identity-changed",
        status: "server-identity-changed",
        calls: ["baseline", "install", "verify"],
      },
      {
        intent: "update",
        state: "ready",
        applied: "failed",
        verdict: "verified",
        status: "installer-failed",
        calls: ["baseline", "install"],
      },
      {
        intent: "update",
        state: "unverified",
        applied: "applied",
        verdict: "verified",
        status: "baseline-unverified",
        calls: ["baseline"],
      },
    ]) {
      const observed: string[] = [];
      const deploy = (await loader.load(
        "skills/vibestudio-workflows/runWorkflow.nl",
        {
          services: {
            remoteDeploymentRead: {
              observe: async (operationId: string) => {
                expect(operationId).toBe("assignment");
                observed.push("baseline");
                return {
                  receipt: "baseline",
                  intent: example.intent,
                  state: example.state,
                  hasPriorIdentity: example.state === "ready",
                };
              },
            },
            remoteDeploymentApply: {
              apply: async (receipt: string) => {
                expect(receipt).toBe("baseline");
                observed.push("install");
                return { receipt: "install", state: example.applied };
              },
            },
            remoteDeploymentVerify: {
              verify: async (receipt: string) => {
                expect(receipt).toBe("install");
                observed.push("verify");
                return {
                  receipt: "verify",
                  state: example.verdict,
                  identity: example.verdict === "verified" ? identity : null,
                };
              },
            },
          },
        },
      )) as (request: unknown) => Promise<unknown>;
      await expect(
        deploy({
          goal: "Prepare the assigned server",
          work: [
            {
              kind: "domain",
              domain: "remoteAccess",
              operation: "deployRemoteServer",
              input: { operationId: "assignment" },
            },
          ],
        }),
      ).resolves.toMatchObject({
        results: [
          {
            report: {
              status: example.status,
              identity: example.status === "deployment-ready" ? identity : null,
              evidenceIds: example.calls,
            },
          },
        ],
        remaining: [],
      });
      expect(observed).toEqual(example.calls);
    }
    stagedCalls.length = 0;
    runReference = false;
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
