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
