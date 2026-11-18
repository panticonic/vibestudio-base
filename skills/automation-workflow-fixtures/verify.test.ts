import { describe, expect, it } from "vitest";
import { automationWorlds } from "./worlds.js";
import { verifyAutomationWorld } from "./verify.js";

describe("automation task outcomes", () => {
  it("accepts exact lifecycle identity and rejects correct actions applied to the wrong mission", () => {
    const fixture = automationWorlds.find(
      (world) => world.id === "automation-exact-id-wins",
    )!;
    const reference = {
      kind: "control" as const,
      automationId: "west",
      action: "pause" as const,
    };
    expect(verifyAutomationWorld(fixture, reference).passed).toBe(true);
    expect(
      verifyAutomationWorld(fixture, { ...reference, automationId: "east" })
        .passed,
    ).toBe(false);
    const alias = {
      ...fixture,
      sourceGroup: fixture.sourceGroup,
      id: "automation-renamed-test",
    };
    expect(verifyAutomationWorld(alias, reference).passed).toBe(true);
  });

  it("requires recorded incomplete results and exact lifecycle state", () => {
    const fixture = automationWorlds.find(
      (world) => world.id === "automation-recorded-child-failure",
    )!;
    const reference = {
      kind: "inspect" as const,
      automationId: "import",
      runId: "run-2",
      state: "active" as const,
      outcome: "completed-with-errors" as const,
      failedOperations: ["fs.readdir", "vcs.status"],
    };
    expect(verifyAutomationWorld(fixture, reference).passed).toBe(true);
    expect(
      verifyAutomationWorld(fixture, { ...reference, failedOperations: [] })
        .passed,
    ).toBe(false);
  });
});
