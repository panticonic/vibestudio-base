import { phoneSetup } from "./index.js";
import type {
  DesktopCandidate,
  DiscoveredPhones,
  PhonePairing,
  PhonePlatform,
  PhoneSetupRequest,
  PreparedDesktop,
  SetupStart,
  WorkspaceObservation,
} from "./natlang/types.js";

type SetupTarget = {
  platform: PhonePlatform;
  providerId?: string;
  deviceId?: string;
  mode?: "auto" | "release" | "source";
};
export type PhoneSetupAssignment =
  | { goal: string; target: SetupTarget; paired?: never }
  | {
      goal: string;
      paired: { deviceId: string; platform: PhonePlatform };
      target?: never;
    };

/** Bind hardware operations only in the workspace that owns the public phone setup service. */
export async function bindPhoneSetup(
  assignment: PhoneSetupAssignment,
  { signal }: { signal?: AbortSignal } = {},
) {
  signal?.throwIfAborted();
  const client = await phoneSetup();
  const target = assignment.target ? { ...assignment.target } : null;
  const platform = target?.platform ?? assignment.paired!.platform;
  const operationId = crypto.randomUUID();
  const receipt = (step: string) => `${operationId}:${step}`;
  let phase:
    | "start"
    | "assigned"
    | "prepared"
    | "discovered"
    | "paired"
    | "terminal" = "start";
  let desktops: DesktopCandidate[] = [];
  let providerId: string | null = null;
  let admittedDeviceId: string | null = null;
  let pairedDeviceId = assignment.paired?.deviceId ?? null;
  let pairingReceipt: string | null = null;

  function claim(expected: typeof phase, supplied: string, observed: string) {
    signal?.throwIfAborted();
    if (phase !== expected || supplied !== observed)
      throw new Error(
        "The phone setup receipt does not belong to the current stage",
      );
    phase = "terminal";
  }

  const request: PhoneSetupRequest = { goal: assignment.goal, operationId };
  const services = {
    phoneSetupRead: {
      async start(id: string): Promise<SetupStart> {
        claim("start", id, operationId);
        if (target) {
          desktops = (await client.providers())
            .filter((desktop) => desktop.platforms.includes(platform))
            .filter(
              (desktop) =>
                target.mode !== "source" ||
                desktop.sourcePlatforms.includes(platform),
            )
            .filter(
              (desktop) =>
                !target.providerId || desktop.providerId === target.providerId,
            )
            .map(({ providerId, label, sourcePlatforms }) => ({
              providerId,
              label,
              supportsSource: sourcePlatforms.includes(platform),
            }));
        }
        const startReceipt = receipt("assignment");
        if (pairedDeviceId) {
          pairingReceipt = startReceipt;
          phase = "paired";
        } else {
          phase = "assigned";
        }
        return {
          receipt: startReceipt,
          platform,
          providerId: target?.providerId ?? null,
          deviceId: target?.deviceId ?? null,
          desktops: desktops.map((desktop) => ({ ...desktop })),
          pairedDeviceId,
        };
      },
      async discover(prepareReceipt: string): Promise<DiscoveredPhones> {
        claim("prepared", prepareReceipt, receipt("prepare"));
        const result = await client.devices(providerId!, platform);
        const devices = result.devices.filter(
          (device) =>
            device.providerId === providerId &&
            device.platform === platform &&
            (!target?.deviceId || device.deviceId === target.deviceId),
        );
        const ready = devices.filter((device) => device.ready);
        if (ready.length === 1) admittedDeviceId = ready[0]!.deviceId;
        phase = "discovered";
        return {
          receipt: receipt("discovery"),
          devices: devices.map(({ deviceId, name, kind, state, ready }) => ({
            deviceId,
            name: name ?? kind,
            kind,
            state,
            ready,
          })),
          actions: result.issues
            .filter((issue) => issue.providerId === providerId && issue.action)
            .map((issue) => issue.action!),
        };
      },
      async readiness(priorReceipt: string): Promise<WorkspaceObservation> {
        if (!pairedDeviceId || !pairingReceipt)
          throw new Error("The device has no pairing receipt");
        claim("paired", priorReceipt, pairingReceipt);
        const id = receipt("readiness");
        try {
          const current = await client.readiness(pairedDeviceId, signal);
          return { receipt: id, state: current.status };
        } catch {
          signal?.throwIfAborted();
          return { receipt: id, state: "unreachable" };
        }
      },
    },
    phoneSetupPrepare: {
      async prepare(
        startReceipt: string,
        selected: string,
      ): Promise<PreparedDesktop> {
        if (desktops.length !== 1 || desktops[0]!.providerId !== selected)
          throw new Error("Select the exact eligible assigned desktop");
        claim("assigned", startReceipt, receipt("assignment"));
        providerId = selected;
        const id = receipt("prepare");
        try {
          await client.prepare(providerId, platform);
          phase = "prepared";
          return { receipt: id, state: "prepared" };
        } catch {
          signal?.throwIfAborted();
          return { receipt: id, state: "preparation-unconfirmed" };
        }
      },
    },
    phoneSetupPair: {
      async provision(
        discoveryReceipt: string,
        deviceId: string,
      ): Promise<PhonePairing> {
        if (
          !target ||
          !providerId ||
          !admittedDeviceId ||
          deviceId !== admittedDeviceId
        )
          throw new Error(
            "Provisioning requires exactly one eligible ready phone from discovery",
          );
        claim("discovered", discoveryReceipt, receipt("discovery"));
        const id = receipt("pairing");
        try {
          await client.provision(
            { providerId, platform, deviceId, mode: target.mode },
            (event) => {
              if (event.type !== "paired" || pairingReceipt !== null) return;
              const paired = event.result;
              if (
                paired.providerId !== providerId ||
                paired.platform !== platform ||
                paired.attachedDeviceId !== deviceId
              )
                return;
              pairingReceipt = id;
              pairedDeviceId = paired.pairedDevice.deviceId;
            },
          );
        } catch {
          // A later stream failure cannot undo an already confirmed pairing.
          signal?.throwIfAborted();
        }
        signal?.throwIfAborted();
        if (pairedDeviceId) phase = "paired";
        return { receipt: id, pairedDeviceId };
      },
    },
  };
  return { request, services, pairedDevice: () => pairedDeviceId };
}
