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
function nextReadinessObservation(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const timer = setTimeout(finish, 1_000);
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

export async function phoneSetup() {
  const service = await workers.resolveService(
    "vibestudio.phone-provisioning.v1",
  );
  if (service.kind !== "durable-object")
    throw new Error("Phone setup service is unavailable.");
  const { targetId } = service;
  const readiness = async (deviceId: string, signal?: AbortSignal) =>
    PhoneWorkspaceReadinessSchema.parse(
      await rpc.call(targetId, "readiness", [{ deviceId }], { signal }),
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
    /** Observe the paired phone until its actual workspace lifecycle settles.
     * Slow startup and pending approvals remain opening; elapsed time is not failure. */
    waitForWorkspace: async (
      paired: PhoneProvisioningResult,
      onProgress?: (message: string) => void,
      signal?: AbortSignal,
    ) => {
      for (;;) {
        signal?.throwIfAborted();
        const current = await readiness(paired.pairedDevice.deviceId, signal);
        onProgress?.(current.message);
        if (current.status !== "opening") return current;
        await nextReadinessObservation(signal);
      }
    },
  };
}
