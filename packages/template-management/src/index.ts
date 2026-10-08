import { appCompatibilityError } from "@vibestudio/workspace-contracts/appCompatibility";
import {
  templatesMethods,
  workspaceTemplateSourceMethods,
  type TemplatesClient,
  type TemplateUpdateStatus,
} from "@vibestudio/service-schemas/templates";
import { createTypedServiceClient } from "@vibestudio/shared/typedServiceClient";

/** The same schema owns inspection and authoring signatures on every runtime. */
export type TemplateManagementClient = TemplatesClient;
export function createTemplateManagementClient(
  invoke: (
    extension: string,
    method: string,
    args: unknown[],
  ) => Promise<unknown>,
): TemplateManagementClient {
  return createTypedServiceClient(
    "templates",
    templatesMethods,
    (_service, method, args) =>
      invoke("@workspace-extensions/templates", method, args),
  );
}

/**
 * Trusted shell composition: moving URLs resolve in the extension, while every
 * exact pin is inspected by the host's single acquisition owner.
 */
export function createShellTemplateManagementClient(
  invoke: (
    extension: string,
    method: string,
    args: unknown[],
  ) => Promise<unknown>,
  callHost: (
    service: string,
    method: string,
    args: unknown[],
  ) => Promise<unknown>,
): TemplateManagementClient {
  const extension = createTemplateManagementClient(invoke);
  const exact = createTypedServiceClient(
    "workspaceTemplateSource",
    workspaceTemplateSourceMethods,
    callHost,
  );
  return {
    ...extension,
    async inspect(locator) {
      const pin =
        "pin" in locator ? locator.pin : await extension.resolveSource(locator);
      return exact.inspectExact(pin);
    },
  };
}

export function templateUpdateAgentPrompt(
  source: Awaited<ReturnType<TemplatesClient["installed"]>>[number],
  check?: TemplateUpdateStatus["checks"][number],
  operationId?: string,
  host?: Partial<
    Pick<TemplateUpdateStatus, "workspaceAppVersion" | "currentAppVersion">
  >,
) {
  return [
    "Review an upstream template update for this workspace. Handle the update agentically: understand incoming changes and local intent before merging, including changes the VCS considers conflict-free.",
    `Recorded source: ${JSON.stringify(source.pin)}.`,
    ...(host?.workspaceAppVersion && host.currentAppVersion
      ? [
          `Workspace host: Vibestudio ${host.workspaceAppVersion}; surrounding app: Vibestudio ${host.currentAppVersion}.`,
        ]
      : []),
    check?.target
      ? `Exact discovered target: ${JSON.stringify(check.target)}; target systemEpoch: ${check.targetEpoch}; minimum app version: ${check.targetMinimumAppVersion ?? "unspecified"}.`
      : "Check the recorded upstream for an exact target first.",
    operationId
      ? `Resume existing update operation ${JSON.stringify(operationId)} rather than preparing a duplicate.`
      : "Prepare a separate semantic review context using the template lifecycle tools only after inspecting compatibility.",
    "This request authorizes preparing and resolving a merge in a separate review context. Read the templates skill and its workspace-updates reference. Inspect the base, local edits, and incoming source; preserve local intent, resolve semantic changes with the ordinary VCS tools, and run relevant checks. Do not treat an automatic clean merge as sufficient review.",
    "Gate preparation and publication on the composed minimumAppVersion requirement. If the host is too old, explain the required app update first. Compatibility uses systemEpoch, the host application's major version. A different epoch requires an available matching workspace host and the reviewed epoch-transition handoff; never change the epoch just to silence validation or activate a foreign template in the old host. Preparation must use an available matching target host and a source schema the composer understands.",
    "Present the proposed changes, compatibility requirements, and verification results. Ask the user to approve the concrete result before publishing to workspace main, installing an app update, or restarting. Do not apply the update merely because this review was requested.",
  ].join("\n\n");
}

/** Compatibility language for the inbox and source inspector. */
export function templateUpdateCompatibility(
  check: TemplateUpdateStatus["checks"][number],
  host: Partial<
    Pick<TemplateUpdateStatus, "workspaceAppVersion" | "currentAppVersion">
  >,
): {
  state: "ready" | "app-update-required" | "host-unavailable";
  message: string;
} {
  const requirement = {
    systemEpoch: check.targetEpoch ?? 0,
    minimumAppVersion: check.targetMinimumAppVersion,
  };
  const available = [
    host.currentAppVersion,
    check.targetAppVersion,
    host.workspaceAppVersion,
  ].find((version) => version && !appCompatibilityError(requirement, version));
  if (check.targetEpoch !== undefined && available) {
    return {
      state: "ready",
      message:
        available !== host.currentAppVersion
          ? `Uses retained host Vibestudio ${available}. Ready to review.`
          : "Ready to review with an agent.",
    };
  }
  const required = check.targetMinimumAppVersion ?? `${check.targetEpoch}.x`;
  const currentEpoch = host.currentAppVersion
    ? Number(host.currentAppVersion.split(".")[0])
    : undefined;
  if (
    (currentEpoch !== undefined && requirement.systemEpoch < currentEpoch) ||
    (currentEpoch === undefined && check.hostError)
  ) {
    return {
      state: "host-unavailable",
      message: `Requires Vibestudio ${required}. A compatible workspace host is unavailable. An agent can help plan a migration or explain how to restore the required host.`,
    };
  }
  return {
    state: "app-update-required",
    message: `Requires Vibestudio ${required}. An agent can explain the app update and prepare the merge once compatible.`,
  };
}

/** One normal agent conversation reviews the whole workspace upgrade. */
export function templateWorkspaceUpdateAgentPrompt(
  parents: TemplateUpdateStatus["checks"],
  updates: TemplateUpdateStatus["checks"],
  host: Partial<
    Pick<TemplateUpdateStatus, "workspaceAppVersion" | "currentAppVersion">
  >,
): string {
  const first = parents[0] ?? updates[0];
  if (!first)
    throw new Error("A workspace update review needs an upstream target");
  return [
    templateUpdateAgentPrompt(
      {
        pin: first.source,
        repositories: [],
        dependencies: [],
        relationship: "direct",
      },
      first,
      undefined,
      host,
    ),
    "Review this as one coherent workspace upgrade. Start with the parent templates; their incoming declarations choose the dependency closure. The additional upstream targets are evidence to inspect, not instructions to merge every moving head independently or to ignore exact dependency pins.",
    "Check the current installed sources before acting. If this notice has been superseded or a target is already installed, explain that and refresh discovery. Never downgrade the workspace just to match a stale notice. Use the ordinary template lifecycle and VCS tools; resume an existing suitable review context if one is already available.",
    `Parent targets (data): ${JSON.stringify(parents)}.`,
    `All discovered source updates (data): ${JSON.stringify(updates)}.`,
  ].join("\n\n");
}
