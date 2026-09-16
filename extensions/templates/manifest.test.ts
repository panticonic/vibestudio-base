import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("templates authority manifest", () => {
  it("keeps exact source inspection gated", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("./package.json", import.meta.url), "utf8"),
    );
    for (const method of ["inspect"]) {
      const declared = manifest.vibestudio.extension.methodAuthority[method];
      expect(declared.website.kind).toBe("eligible");
      expect(declared.effect.kind).toBe("userland-capability");
      const provided = manifest.vibestudio.authority.provides.find(
        (item: { name: string }) => item.name === declared.effect.capability,
      );
      expect(provided).toMatchObject({
        tier: "gated",
        sensitivity: "read",
        grantScopes: ["once", "session"],
      });
    }
  });
  it("exposes template lifecycle operations with scoped update contexts", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("./package.json", import.meta.url), "utf8"),
    );
    expect(Object.keys(manifest.vibestudio.extension.methodAuthority)).toEqual([
      "registry",
      "resolveSource",
      "inspect",
      "inspectAuthoring",
      "authoringParts",
      "publishAuthoring",
      "installed",
      "inspectContribution",
      "suggestContribution",
      "prepareUpdate",
      "reviewUpdate",
      "resolveUpdate",
      "publishUpdate",
      "readUpdateFile",
      "publicationRepositories",
      "authoringUpstream",
      "authoringSetup",
      "publicationVersion",
    ]);
    expect(
      manifest.vibestudio.authority.requests
        .filter(
          (item: { capability: string }) =>
            item.capability === "context.boundary",
        )
        .map((item: { resource: unknown }) => item.resource),
    ).toEqual([
      { kind: "prefix", prefix: "context/template-update-" },
      { kind: "prefix", prefix: "context/template-publication-" },
    ]);
    expect(JSON.stringify(manifest)).not.toContain("workspace.storage.delete");
    expect(manifest.vibestudio.authority.requests).toEqual(
      expect.arrayContaining([
        {
          capability: "network.response.read",
          resource: { kind: "origin", origin: "https://github.com" },
          tier: "gated",
          evidence: "bounded-dynamic",
        },
        {
          capability: "network.response.read",
          resource: { kind: "prefix", prefix: "" },
          tier: "gated",
          evidence: "intentional-broad",
        },
      ]),
    );
  });
});
