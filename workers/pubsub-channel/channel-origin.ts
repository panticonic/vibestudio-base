import type { EnvelopeOrigin } from "@workspace/agentic-protocol";

/**
 * Host-verified caller facts the channel owner may use for provenance.
 * `callerDeviceId` / `callerPanelSource` are the tendrils contract 5.5 fields
 * (work package H2/B3); until they reach the userland caller they are absent
 * and a panel origin carries only its verified slot (`callerPanelId`).
 */
export interface VerifiedCallerFacts {
  callerKind: string;
  callerPanelId?: string;
  callerDeviceId?: string | null;
  callerPanelSource?: string | null;
}

/**
 * Derive an envelope origin from the verified caller only. Nothing here reads
 * publish arguments or payload; `authorizingOriginKind` is the host-attested
 * authorization origin of the same invocation.
 */
export function originFromVerifiedCaller(
  caller: VerifiedCallerFacts | null,
  authorizingOriginKind: string | null,
): EnvelopeOrigin {
  if (authorizingOriginKind === "website") return { surface: "website" };
  if (!caller) return { surface: "host" };
  const deviceId = caller.callerDeviceId || undefined;
  const withDevice = (origin: EnvelopeOrigin): EnvelopeOrigin =>
    deviceId ? { ...origin, deviceId } : origin;
  if (authorizingOriginKind === "session") return withDevice({ surface: "agent" });
  switch (caller.callerKind) {
    case "panel":
      return withDevice({
        surface: "panel",
        ...(caller.callerPanelSource ? { panelSource: caller.callerPanelSource } : {}),
        ...(caller.callerPanelId ? { slotId: caller.callerPanelId } : {}),
      });
    case "shell":
      return withDevice({ surface: "shell" });
    case "client":
      return withDevice({ surface: "client" });
    case "server":
      return { surface: "host" };
    // Autonomous code principals: agent vessels, workers, extensions.
    default:
      return { surface: "agent" };
  }
}
