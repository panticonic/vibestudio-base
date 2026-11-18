import { expect, it } from "vitest";
import { verifyProvenanceWorld } from "./verify.js";
import { provenanceReviewWorlds } from "./worlds.js";

it("admits a current constraint only with the expected disclosed references", () => {
  const world = provenanceReviewWorlds.find(
    ({ id }) => id === "provenance-hidden-objection-never-cited",
  )!;
  const report = {
    kind: "constraint" as const,
    status: "supported" as const,
    evidence: ["@reviewed-commit", "@review-goal"],
  };
  expect(verifyProvenanceWorld(world, report).passed).toBe(true);
  expect(
    verifyProvenanceWorld(world, {
      ...report,
      evidence: [...report.evidence, "@external-noaccess"],
    }).passed,
  ).toBe(false);
  expect(verifyProvenanceWorld({ ...world, id: "alias" }, report).passed).toBe(
    true,
  );
});
it("preserves external source evidence without inferring importer intent", () => {
  const world = provenanceReviewWorlds.find(
    ({ id }) => id === "provenance-external-custody-end",
  )!;
  const report = {
    kind: "attribution" as const,
    origin: "external-import" as const,
    references: ["@snapshot-3", "@action-71"],
    supportedIntent: null,
    boundary: "external snapshot",
  };
  expect(verifyProvenanceWorld(world, report).passed).toBe(true);
  expect(
    verifyProvenanceWorld(world, { ...report, supportedIntent: "@action-71" })
      .passed,
  ).toBe(false);
});
