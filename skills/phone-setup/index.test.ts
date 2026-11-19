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
import { phoneProvisioningMethods } from "@vibestudio/service-schemas/phoneProvisioning";
import { phoneSetupStream } from "@vibestudio/service-schemas/clients/phoneSetupStream";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";
const transport = vi.hoisted(() => ({ call: vi.fn(), stream: vi.fn() }));
vi.mock("@workspace/runtime", async () => {
  const { schemaRpcMock } = await import("@vibestudio/rpc/test-utils");
  const caller = schemaRpcMock(transport);
  return {
    rpc: { ...transport, ...caller },
    workers: {
      resolveService: async () => durableObjectServiceFixture("phone-service"),
    },
  };
});
import { phoneSetup } from "./index.js";
import { bindPhoneSetup } from "./workflow.js";
import type { PhoneSetupReport, PhoneSetupRequest } from "./natlang/types.js";
const paired = {
  providerId: "desktop",
  platform: "android" as const,
  workspace: "System",
  attachedDeviceId: "serial",
  installStatus: "installed" as const,
  compatibleAppInstalled: true as const,
  pairingStatus: "paired" as const,
  workspaceStatus: "opening" as const,
  pairedDevice: { deviceId: "phone", label: "Phone", createdAt: 1 },
};
afterEach(() => vi.resetAllMocks());
it("uses public arguments and retains the paired result while readiness is pending", async () => {
  transport.call.mockImplementation(
    async (target, method: keyof typeof phoneProvisioningMethods, args) => {
      expect(target).toBe("phone-service");
      phoneProvisioningMethods[method].args.parse(args);
      if (method === "prepare") return { ready: true };
      if (method === "readiness")
        return { status: "opening", message: "Loading workspace" };
      return { devices: [], issues: [] };
    },
  );
  transport.stream.mockImplementation(async (target, method, args) => {
    expect(target).toBe("phone-service");
    expect(method).toBe("provision");
    phoneProvisioningMethods.provision.args.parse(args);
    return phoneSetupStream(async (emit) => {
      emit({ type: "paired", result: paired });
    });
  });
  const phone = await phoneSetup();
  await phone.prepare("desktop");
  await phone.devices("desktop");
  const result = await phone.provision({
    providerId: "desktop",
    platform: "android",
    deviceId: "serial",
  });
  expect(result).toEqual(paired);
  expect(await phone.readiness(result.pairedDevice.deviceId)).toEqual({
    status: "opening",
    message: "Loading workspace",
  });
  expect(transport.stream).toHaveBeenCalledTimes(1);
  expect(transport.call).toHaveBeenLastCalledWith(
    "phone-service",
    "readiness",
    [{ deviceId: "phone" }],
    { signal: undefined },
  );
});
it("propagates the original readiness failure without losing the paired result", async () => {
  const failure = new Error("Connection interrupted");
  transport.call.mockRejectedValue(failure);
  const phone = await phoneSetup();
  await expect(phone.waitForWorkspace(paired)).rejects.toBe(failure);
  expect(paired.pairingStatus).toBe("paired");
  expect(transport.stream).not.toHaveBeenCalled();
});
it("keeps slow startup opening until authoritative readiness and cancels an owned observation", async () => {
  vi.useFakeTimers();
  try {
    transport.call
      .mockImplementationOnce(async () => {
        vi.setSystemTime(Date.now() + 300_000);
        return { status: "opening", message: "Loading" };
      })
      .mockResolvedValueOnce({ status: "ready", message: "Ready" });
    const phone = await phoneSetup();
    const waiting = phone.waitForWorkspace(paired);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(waiting).resolves.toEqual({
      status: "ready",
      message: "Ready",
    });
    transport.call.mockResolvedValue({
      status: "opening",
      message: "Pending approval",
    });
    const controller = new AbortController();
    const cancelled = phone.waitForWorkspace(
      paired,
      undefined,
      controller.signal,
    );
    const reason = new Error("Panel closed");
    const assertion = expect(cancelled).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(reason);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
    expect(transport.stream).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it("resumes through the shared setup tree after the pairing stream fails with a confirmed device", async () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const commands: Record<string, string> = {
    runWorkflow: `
      const item = request.work[0];
      const report = await domains.phoneSetup.setUpPhone(item.input);
      return {results: [{kind: item.kind, domain: item.domain, operation: item.operation, report}], remaining: []};
    `,
    setUpPhone: `
      const assigned = await readAssignment(request.operationId);
      const evidenceIds = [assigned.receipt];
      let pairedDeviceId = assigned.pairedDeviceId;
      if (!pairedDeviceId) {
        const found = await discoverPhone(assigned);
        evidenceIds.push(...found.evidenceIds);
        if (found.status !== "selected") {
          return {status: found.status, guidance: found.guidance, pairedDeviceId: null, evidenceIds};
        }
        const pairing = await pairPhone(evidenceIds.at(-1), found.deviceId);
        evidenceIds.push(pairing.receipt);
        pairedDeviceId = pairing.pairedDeviceId;
        if (!pairedDeviceId) return {status:"pairing-unconfirmed", guidance:"Inspect the setup card", pairedDeviceId, evidenceIds};
      }
      const check = await checkWorkspace(evidenceIds.at(-1));
      return {status: check.status, guidance:null, pairedDeviceId, evidenceIds:[...evidenceIds,...check.evidenceIds]};
    `,
    readAssignment: "return await phoneSetupRead.start(operationId);",
    discoverPhone: `
      const desktop = await chooseDesktop(assignment);
      if (!desktop) return {status:assignment.desktops.length ? "choose-desktop" : "desktop-unavailable",
        deviceId:null,guidance:"Use the setup card",evidenceIds:[]};
      const preparation = await prepareDesktop(assignment.receipt, desktop);
      if (preparation.state !== "prepared") return {status:"preparation-unconfirmed",
        deviceId:null,guidance:"Inspect the setup card",evidenceIds:[preparation.receipt]};
      const discovery = await observePhones(preparation.receipt);
      const result = await choosePhone(discovery, assignment.deviceId);
      return {...result, evidenceIds:[preparation.receipt, discovery.receipt]};
    `,
    chooseDesktop:
      "return assignment.desktops.length === 1 ? assignment.desktops[0].providerId : null;",
    prepareDesktop:
      "return await phoneSetupPrepare.prepare(startReceipt, providerId);",
    observePhones: "return await phoneSetupRead.discover(prepareReceipt);",
    choosePhone: `
      const ready = discovery.devices.filter(phone => phone.ready && (!assignedDeviceId || phone.deviceId === assignedDeviceId));
      if (ready.length === 1) return {status:"selected",deviceId:ready[0].deviceId,guidance:null};
      if (ready.length > 1) return {status:"choose-phone",deviceId:null,guidance:"Use the setup card"};
      return {status:"physical-action", deviceId:null, guidance:discovery.actions[0] ?? "Connect and unlock the assigned phone"};
    `,
    pairPhone:
      "return await phoneSetupPair.provision(discoveryReceipt, deviceId);",
    checkWorkspace: `
      const observation = await observeWorkspace(pairingReceipt);
      return {status:await interpretReadiness(observation),evidenceIds:[observation.receipt]};
    `,
    observeWorkspace: "return await phoneSetupRead.readiness(pairingReceipt);",
    interpretReadiness: 'return "workspace-" + observation.state;',
  };
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      const name = session.lam.functionName!;
      const code = commands[name];
      if (!code) throw new Error("Unexpected setup stage " + name);
      const action = await session.applyAsync("eval", { code, finish: true });
      if (action.kind === "rejected") throw new Error(action.text);
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
  async function run(binding: Awaited<ReturnType<typeof bindPhoneSetup>>) {
    type Request = {
      goal: string;
      work: {
        kind: string;
        domain: string;
        operation: string;
        input: PhoneSetupRequest;
      }[];
    };
    const root = (await loader.load(
      "skills/vibestudio-workflows/runWorkflow.nl",
      {
        services: binding.services,
      },
    )) as (
      request: Request,
    ) => Promise<{ results: { report: PhoneSetupReport }[] }>;
    const output = await root({
      goal: binding.request.goal,
      work: [
        {
          kind: "domain",
          domain: "phoneSetup",
          operation: "setUpPhone",
          input: binding.request,
        },
      ],
    });
    return output.results[0]?.report;
  }

  let deviceReady = false;
  let workspaceReady = false;
  const observations: string[] = [];
  transport.call.mockImplementation(
    async (_target, method: keyof typeof phoneProvisioningMethods, args) => {
      phoneProvisioningMethods[method].args.parse(args);
      observations.push(method);
      if (method === "providers")
        return [
          {
            providerId: "desktop",
            label: "Build desktop",
            hostPlatform: "linux",
            platforms: ["android"],
            sourcePlatforms: ["android"],
            appVersion: "test",
          },
        ];
      if (method === "prepare") return { ready: true };
      if (method === "readiness") {
        expect(args).toEqual([{ deviceId: "phone" }]);
        return {
          status: workspaceReady ? "ready" : "opening",
          message: "Workspace readback",
        };
      }
      expect(method).toBe("devices");
      return {
        devices: [
          {
            providerId: "desktop",
            platform: "android",
            deviceId: "serial",
            kind: "physical",
            state: deviceReady ? "device" : "unauthorized",
            ready: deviceReady,
            installedApps: [],
            compatibleAppInstalled: false,
          },
        ],
        issues: deviceReady
          ? []
          : [
              {
                providerId: "desktop",
                code: "unauthorized",
                message: "USB trust pending",
                action: "Accept the USB debugging prompt",
              },
            ],
      };
    },
  );
  transport.stream.mockImplementation(async (_target, method, args) => {
    expect(method).toBe("provision");
    expect(args).toEqual([
      {
        providerId: "desktop",
        platform: "android",
        deviceId: "serial",
        mode: "source",
      },
    ]);
    observations.push(method);
    return phoneSetupStream(async (emit) => {
      emit({ type: "paired", result: paired });
      throw new Error("Desktop disconnected after confirming pairing");
    });
  });
  const target = {
    platform: "android",
    deviceId: "serial",
    mode: "source",
  } as const;
  await expect(
    run(await bindPhoneSetup({ goal: "Set up the assigned phone", target })),
  ).resolves.toMatchObject({
    status: "physical-action",
    pairedDeviceId: null,
    guidance: "Accept the USB debugging prompt",
  });
  expect(observations.splice(0)).toEqual(["providers", "prepare", "devices"]);

  deviceReady = true;
  const setup = await bindPhoneSetup({ goal: "Pair the ready phone", target });
  await expect(
    setup.services.phoneSetupPair.provision("unchecked-phone", "serial"),
  ).rejects.toThrow(/eligible ready phone/);
  await expect(run(setup)).resolves.toMatchObject({
    status: "workspace-opening",
    pairedDeviceId: "phone",
  });
  expect(setup.pairedDevice()).toBe("phone");
  expect(observations.splice(0)).toEqual([
    "providers",
    "prepare",
    "devices",
    "provision",
    "readiness",
  ]);

  workspaceReady = true;
  const continuation = await bindPhoneSetup({
    goal: "Confirm the previously paired phone is ready",
    paired: { deviceId: "phone", platform: "android" },
  });
  await expect(run(continuation)).resolves.toMatchObject({
    status: "workspace-ready",
    pairedDeviceId: "phone",
  });
  expect(observations).toEqual(["readiness"]);
  expect(transport.stream).toHaveBeenCalledTimes(1);
});
