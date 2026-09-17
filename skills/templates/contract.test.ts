import * as fs from "node:fs";
import { describe, expect, it } from "vitest";
import { templatesMethods } from "@vibestudio/service-schemas/templates";

describe("templates skill public contract", () => {
  it("documents the current exact-pin and authoring contract", () => {
    const root = new URL(".", import.meta.url);
    const contract = JSON.parse(
      fs.readFileSync(new URL("public-contract.json", root), "utf8"),
    ) as {
      methods: Record<string, { arguments: unknown; sensitivity: string }>;
      invariants: string[];
    };
    const skill = fs.readFileSync(new URL("SKILL.md", root), "utf8");
    const prose = skill.replace(/\s+/g, " ");
    const invariants = contract.invariants.join(" ");

    expect(Object.keys(contract.methods).sort()).toEqual(
      Object.keys(templatesMethods).sort(),
    );
    for (const name of Object.keys(templatesMethods) as Array<
      keyof typeof templatesMethods
    >) {
      expect(contract.methods[name]!.sensitivity).toBe(
        templatesMethods[name].access.sensitivity,
      );
    }
    expect(JSON.stringify(contract.methods["inspect"]!.arguments)).toContain(
      "pin",
    );
    expect(JSON.stringify(contract.methods["inspectAuthoring"]!.arguments)).toContain(
      "parts",
    );
    expect(JSON.stringify(contract.methods["publishAuthoring"]!.arguments)).toContain(
      "expectedFingerprint",
    );

    expect(prose).toContain("exact immutable `pin`");
    expect(prose).toContain("creating a new independently running workspace");
    expect(prose).toContain("compare and merge operations");
    expect(skill).toContain(
      'extensions.invoke("@workspace-extensions/templates", "inspect", [',
    );
    expect(invariants).toContain("inspect resolves once to an exact pin");
    expect(invariants).toContain(
      "workspace creation consumes the exact inspected pin",
    );
    expect(invariants).toContain(
      "source integration into an existing workspace uses ordinary VCS comparison and merge",
    );
    expect(invariants).toContain("publication grants no runtime authority");
  });
});
