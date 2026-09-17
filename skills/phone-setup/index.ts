import { rpc, workers } from "@workspace/runtime";
import {
  PhoneDeviceDiscoverySchema,
  PhoneProviderSchema,
  PhoneWorkspaceReadinessSchema,
  type PhoneProvisionArgs,
  type PhoneProvisioningResult,
} from "@vibestudio/service-schemas/phoneProvisioning";
import {
  consumePhoneSetup,
  type PhoneSetupEvent,
} from "@vibestudio/service-schemas/clients/phoneSetupStream";

/** One public client for both the inline card and agent automation. */
export async function phoneSetup() {
  const service = await workers.resolveService(
    "vibestudio.phone-provisioning.v1",
  );
  if (service.kind !== "durable-object")
    throw new Error("Phone setup service is unavailable.");
  const { targetId } = service;
  const readiness = async (deviceId: string) =>
    PhoneWorkspaceReadinessSchema.parse(
      await rpc.call(targetId, "readiness", [{ deviceId }]),
    );
  return {
    providers: async () =>
      PhoneProviderSchema.array().parse(
        await rpc.call(targetId, "providers", []),
      ),
    prepare: async (
      providerId: string,
      platform: "android" | "ios" = "android",
    ) => {
      await rpc.call(targetId, "prepare", [{ providerId, platform }]);
    },
    devices: async (
      providerId: string,
      platform: "android" | "ios" = "android",
    ) =>
      PhoneDeviceDiscoverySchema.parse(
        await rpc.call(targetId, "devices", [{ providerId, platform }]),
      ),
    provision: async (
      input: PhoneProvisionArgs,
      onEvent?: (event: PhoneSetupEvent) => void,
    ) => {
      return consumePhoneSetup(
        await rpc.stream(targetId, "provision", [input]),
        onEvent,
      );
    },
    readiness,
    /** A waiting/failed result is deliberately not success; checking again never re-pairs. */
    waitForWorkspace: async (
      paired: PhoneProvisioningResult,
      onProgress?: (message: string) => void,
      timeoutMs = 180_000,
    ) => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const current = await readiness(paired.pairedDevice.deviceId).catch(
          (error) => ({
            status: "failed" as const,
            message: `The phone is paired, but workspace readiness could not be checked: ${error instanceof Error ? error.message : String(error)}`,
          }),
        );
        onProgress?.(current.message);
        if (current.status !== "opening" || Date.now() >= deadline)
          return current;
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    },
  };
}
