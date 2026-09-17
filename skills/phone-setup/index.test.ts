import { afterEach, expect, it, vi } from "vitest";
import { phoneProvisioningMethods } from "@vibestudio/service-schemas/phoneProvisioning";
import { phoneSetupStream } from "@vibestudio/service-schemas/clients/phoneSetupStream";
const transport = vi.hoisted(() => ({ call: vi.fn(), stream: vi.fn() }));
vi.mock("@workspace/runtime", () => ({
  rpc: transport,
  workers: {
    resolveService: async () => ({
      kind: "durable-object",
      targetId: "phone-service",
    }),
  },
}));
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
  expect(await phone.waitForWorkspace(result, undefined, 0)).toEqual({
    status: "opening",
    message: "Loading workspace",
  });
  expect(transport.stream).toHaveBeenCalledTimes(1);
  expect(transport.call).toHaveBeenLastCalledWith(
    "phone-service",
    "readiness",
    [{ deviceId: "phone" }],
  );
});
it("reports a readiness failure as a partial outcome so pairing evidence is not lost", async () => {
  transport.call.mockRejectedValue(new Error("Connection interrupted"));
  const phone = await phoneSetup();
  expect(await phone.waitForWorkspace(paired)).toMatchObject({
    status: "failed",
    message: expect.stringContaining("The phone is paired"),
  });
  expect(transport.stream).not.toHaveBeenCalled();
});
