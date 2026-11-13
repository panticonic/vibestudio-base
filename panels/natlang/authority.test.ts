import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { capabilityPatternCovers } from "@vibestudio/shared/authorityManifest";
import {
  HOST_AUTHORITY_METHODS,
  HOST_METHOD_MANIFEST_DEPENDENCIES,
} from "@vibestudio/shared/authority/hostAuthorityCatalog.generated";
import { docsMethods } from "@vibestudio/service-schemas/docs";
import { fsMethods } from "@vibestudio/service-schemas/fs";
import { serverLogMethods } from "@vibestudio/service-schemas/serverLog";
import { SERVICE_CATALOG } from "@workspace/natlang-services/catalog";
import workspaceSource from "../../workers/workspace-source/package.json";
import manifest from "./package.json";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const memoryBindingSource = source("../../packages/runtime/src/shared/memory.ts");
const webBindingSource = source("../../packages/runtime/src/shared/web.ts");
const webPagesSource = source("../../packages/web-core/src/pages.ts");

const requests = manifest.vibestudio.authority.requests;
const covers = (capability: string) =>
  requests.some((request) => capabilityPatternCovers(request.capability, capability));

type Contract = Record<string, { capability?: string; tier?: unknown }>;
const tierOf = (definition: { tier?: unknown } | undefined) =>
  typeof definition?.tier === "object" ? (definition.tier as { tier?: string }).tier : definition?.tier;

/** The host contract tables of the catalog services that have one in the host's service schemas. */
const HOST_CONTRACTS: Record<string, Contract> = {
  serverLog: serverLogMethods as never,
  docs: docsMethods as never,
  fs: fsMethods as never,
};

/** The workspace service a worker manifest declares for `protocol`: its calls are admitted as `workspace-service:NAME`. */
function workspaceServiceOf(workerManifest: typeof workspaceSource, protocol: string): string {
  const service = workerManifest.vibestudio.services.find((candidate) => (candidate.protocols as string[]).includes(protocol));
  if (!service) throw new Error(`no service declares ${protocol}`);
  return service.name;
}

/** What a host method needs of its caller's manifest: its own gated capability, and the effects it carries out. */
function hostMethodCapabilities(method: string): string[] {
  const catalogued = (HOST_AUTHORITY_METHODS as Record<string, { capability: string | null; tier: { tier: string } }>)[method];
  const dependencies = (HOST_METHOD_MANIFEST_DEPENDENCIES as Record<string, readonly string[]>)[method] ?? [];
  const own = catalogued?.capability && catalogued.tier.tier !== "open" ? [catalogued.capability] : [];
  return [...own, ...dependencies.filter((dependency) => !dependency.startsWith("service:"))];
}

/**
 * The host methods the `web` binding calls, checked against its source: search goes out through the caller's
 * `credentials.fetch` (the egress proxy then authorizes one concrete credential-use or `network.response.read` effect,
 * which the host's `corsApproval.authorize` carries); pages load through managed Chromium (public, or the signed-in
 * browser session) and the blobstore.
 */
function webHostMethods(): string[] {
  expect(webBindingSource).toContain("credentials.fetch");
  expect(webPagesSource).toContain("createChromiumFetch(deps.rpc, session)");
  const blobstore = [...webPagesSource.matchAll(/mainRpcMethods\["(blobstore\.[A-Za-z]+)"\]/g)].map((match) => match[1]!);
  expect(blobstore.length).toBeGreaterThan(0);
  return ["credentials.proxyFetch", "corsApproval.authorize", "chromiumFetch.openPublic", "chromiumFetch.openBrowser", ...blobstore];
}

/**
 * The panel runs workspace natlang programs on the user's behalf, in its own eval session. Installed code is bounded by
 * its manifest, so a program's services are usable only if the manifest requests what they need; each use still
 * prompts for approval. A natlang program can only use the catalog's services, which makes the set of capabilities
 * finite. Every one is derived here from the contract, manifest or host authority catalog that defines it, and the
 * manifest requests exactly those besides the panel's own.
 */
function derivedCapabilities(): Set<string> {
  const derived = new Set<string>();
  const gadService = `workspace-service:${workspaceServiceOf(workspaceSource, "vibestudio.gad.workspace.v1")}`;
  for (const entry of SERVICE_CATALOG) {
    const contract = HOST_CONTRACTS[entry.name];
    if (contract) {
      for (const method of entry.methods) {
        const definition = contract[method.name];
        // A host contract names its capability and tier (the gated ones are requested); the host's authority
        // catalog adds the effects an open method carries out.
        if (definition?.capability && tierOf(definition) === "gated") derived.add(definition.capability);
        for (const capability of hostMethodCapabilities(`${entry.name}.${method.name}`)) derived.add(capability);
      }
    } else if (entry.name === "memory") {
      // memory.recall is the gad service's recallMemory.
      expect(memoryBindingSource).toContain("createGadServiceClient");
      derived.add(gadService);
    } else if (entry.name === "web") {
      for (const method of webHostMethods()) for (const capability of hostMethodCapabilities(method)) derived.add(capability);
    }
  }
  return derived;
}

/**
 * Catalog services whose calls need no capability of the panel's manifest. Not derivable from this template, so each is
 * pinned where its authority is declared, by a test there that fails if the method stops being open:
 *   - localModels: the local-models extension's `listModels` method authority (System: extensions/local-models);
 *   - systemTests: `inspectSystemTestRun` is an open-tier receiver method that requires the host or a workspace root,
 *     which no manifest request can supply (System testing: workers/system-test-runner).
 */
const ADMITTED_BY_RECEIVER = ["localModels", "systemTests"];

describe("natlang panel authority", () => {
  it("accounts for every service in the catalog: derived, or admitted by its receiver", () => {
    const names = SERVICE_CATALOG.map((entry) => entry.name);
    const derivable = [...Object.keys(HOST_CONTRACTS), "memory", "web"];
    expect([...names].sort()).toEqual([...derivable, ...ADMITTED_BY_RECEIVER].sort());
  });

  it("derives the capabilities of the catalog's services from their contracts, manifests and the host's authority catalog", () => {
    expect([...derivedCapabilities()].sort()).toEqual([
      "credential.use",
      "network.response.read",
      "server-logs.read",
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
