import { describe, expect, it } from "vitest";
import { capabilityPatternCovers } from "@vibestudio/shared/authorityManifest";
import { serverLogMethods } from "@vibestudio/service-schemas/serverLog";
import { SERVICE_CATALOG } from "@workspace/natlang-services/catalog";
import manifest from "./package.json";

const requests = manifest.vibestudio.authority.requests;
const covers = (capability: string) =>
  requests.some((request) => capabilityPatternCovers(request.capability, capability));

/**
 * The panel runs workspace natlang programs on the user's behalf, in its own eval session. Installed code is bounded by
 * its manifest, so a program's services are usable only if the manifest requests what they need; each use still
 * prompts for approval. A natlang program can only use the catalog's services, which makes the set of capabilities
 * finite and derivable: the manifest declares the gated ones, and nothing else.
 */
describe("natlang panel authority", () => {
  it("requests every gated capability of the services a natlang program can declare", () => {
    const tables: Record<string, Record<string, { capability?: string; tier?: unknown }>> = { serverLog: serverLogMethods as never };
    const gated = new Set<string>();
    for (const entry of SERVICE_CATALOG) {
      const table = tables[entry.name];
      if (!table) continue;
      for (const method of entry.methods) {
        const definition = table[("contractMethod" in method && method.contractMethod) || method.name];
        const tier = typeof definition?.tier === "object" ? (definition.tier as { tier?: string }).tier : definition?.tier;
        if (definition?.capability && tier === "gated") gated.add(definition.capability);
      }
    }
    expect([...gated]).toContain("server-logs.read");
    for (const capability of gated) expect(covers(capability), capability).toBe(true);
  });

  it("requests the workspace services that back the catalog's gad and templates services", () => {
    expect(SERVICE_CATALOG.map((entry) => entry.name)).toEqual(expect.arrayContaining(["gad", "templates"]));
    expect(covers("workspace-service:gad.workspace")).toBe(true);
    expect(covers("userland:extensions/templates/workspace.templates.inspect#*")).toBe(true);
  });

  it("requests nothing a natlang program cannot reach beyond the panel's own needs", () => {
    const own = new Set([
      "context.boundary",
      "subagents.create",
      "workspace-service:model-gateway",
      "workspace-service:models",
      "workspace-service:natlang-records",
      "workspace.runtime-state.manage",
      "server-logs.read",
      "workspace-service:gad.workspace",
      "userland:extensions/templates/workspace.templates.inspect#*",
    ]);
    expect(requests.map((request) => request.capability).filter((capability) => !own.has(capability))).toEqual([]);
  });
});
