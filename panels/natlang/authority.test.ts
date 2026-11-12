import { describe, expect, it } from "vitest";
import { capabilityPatternCovers } from "@vibestudio/shared/authorityManifest";
import { fsMethods } from "@vibestudio/service-schemas/fs";
import { problemReportsMethods } from "@vibestudio/service-schemas/problemReports";
import { serverLogMethods } from "@vibestudio/service-schemas/serverLog";
import { vcsMethods } from "@vibestudio/service-schemas/vcs";
import { credentialsMethods } from "@vibestudio/service-schemas/credentials";
import { SERVICE_CATALOG } from "@workspace/natlang-services/catalog";
import templatesExtension from "../../extensions/templates/package.json";
import workspaceSource from "../../workers/workspace-source/package.json";
import manifest from "./package.json";

const requests = manifest.vibestudio.authority.requests;
const covers = (capability: string) =>
  requests.some((request) => capabilityPatternCovers(request.capability, capability));

type Contract = Record<string, { capability?: string; tier?: unknown }>;
const tierOf = (definition: { tier?: unknown } | undefined) =>
  typeof definition?.tier === "object" ? (definition.tier as { tier?: string }).tier : definition?.tier;

/** The host contract tables of the catalog services that have one in the host's service schemas. */
const HOST_CONTRACTS: Record<string, Contract> = {
  serverLog: serverLogMethods as never,
  problemReports: problemReportsMethods as never,
  credentials: credentialsMethods as never,
  fs: fsMethods as never,
  vcs: vcsMethods as never,
};

/** The workspace service a worker manifest declares for `protocol`: its calls are admitted as `workspace-service:NAME`. */
function workspaceServiceOf(workerManifest: typeof workspaceSource, protocol: string): string {
  const service = workerManifest.vibestudio.services.find((candidate) => (candidate.protocols as string[]).includes(protocol));
  if (!service) throw new Error(`no service declares ${protocol}`);
  return service.name;
}

/** The capability an extension's method is admitted under, from the extension manifest's method authority. */
function extensionCapability(method: string): string {
  const authority = (templatesExtension.vibestudio.extension.methodAuthority as Record<string, { effect: { kind: string; capability?: string } }>)[method];
  if (authority?.effect.kind !== "userland-capability" || !authority.effect.capability)
    throw new Error(`templates.${method} is not admitted under a userland capability`);
  return `userland:extensions/templates/${authority.effect.capability}#*`;
}

/**
 * The panel runs workspace natlang programs on the user's behalf, in its own eval session. Installed code is bounded by
 * its manifest, so a program's services are usable only if the manifest requests what they need; each use still
 * prompts for approval. A natlang program can only use the catalog's services, which makes the set of capabilities
 * finite. Every one is derived here from the contract or manifest that defines it, and the manifest requests exactly
 * those besides the panel's own.
 */
function derivedCapabilities(): Set<string> {
  const derived = new Set<string>();
  for (const entry of SERVICE_CATALOG) {
    const contract = HOST_CONTRACTS[entry.name];
    if (contract) {
      // A host contract names its capability and tier: the gated ones are requested, open ones need nothing.
      for (const method of entry.methods) {
        const definition = contract[("contractMethod" in method ? String(method.contractMethod) : method.name)];
        if (definition?.capability && tierOf(definition) === "gated") derived.add(definition.capability);
      }
    } else if (entry.name === "gad") {
      // Its inspectors are the methods of the workspace-source worker's gad.workspace service.
      derived.add(`workspace-service:${workspaceServiceOf(workspaceSource, "vibestudio.gad.workspace.v1")}`);
    } else if (entry.name === "templates") {
      for (const method of entry.methods) derived.add(extensionCapability(method.name));
    }
  }
  return derived;
}

/** Catalog services admitted without a host-gated capability of their own: bindings of the eval or open receivers. */
const NO_OWN_CAPABILITY = ["problemReports", "credentials", "fs", "vcs", "localModels", "web", "memory", "addressees", "systemTests"];

describe("natlang panel authority", () => {
  it("accounts for every service in the catalog: derived or admitted without a gated capability", () => {
    const names = SERVICE_CATALOG.map((entry) => entry.name);
    const derivable = ["serverLog", "gad", "templates"];
    expect([...names].sort()).toEqual([...derivable, ...NO_OWN_CAPABILITY].sort());
  });

  it("derives the capabilities of serverLog, gad and templates from their contracts and manifests", () => {
    expect([...derivedCapabilities()].sort()).toEqual([
      "server-logs.read",
      "userland:extensions/templates/workspace.templates.inspect#*",
      "workspace-service:gad.workspace",
    ]);
  });

  it("requests every derived capability, and nothing else beyond the panel's own", () => {
    const derived = derivedCapabilities();
    for (const capability of derived) expect(covers(capability), capability).toBe(true);
    const own = new Set([
      "context.boundary",
      "subagents.create",
      "workspace-service:model-gateway",
      "workspace-service:models",
      "workspace-service:natlang-records",
      "workspace.runtime-state.manage",
    ]);
    expect(requests.map((request) => request.capability).filter((capability) => !own.has(capability) && !derived.has(capability))).toEqual([]);
  });
});
