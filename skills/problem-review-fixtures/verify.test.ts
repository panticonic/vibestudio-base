import { expect, it } from "vitest";
import { problemReviewWorlds } from "./worlds.js";
import { verifyProblemWorld } from "./verify.js";

it("distinguishes the declined submission from a currently approved draft", () => {
  const world = problemReviewWorlds.find(
    ({ id }) => id === "problem-denied-stops",
  )!;
  const report = {
    defect: "platform" as const,
    next: "submission-stopped" as const,
    basis: "report-7",
    evidence: {
      selected: [],
      incomplete: [],
      attribution: "observed" as const,
    },
  };
  expect(verifyProblemWorld(world, report).passed).toBe(true);
  expect(
    verifyProblemWorld(world, { ...report, next: "ready-to-submit" }).passed,
  ).toBe(false);
  expect(verifyProblemWorld({ ...world, id: "alias" }, report).passed).toBe(
    true,
  );
});
it("separates directly observed selected diagnostics from the unverified original account", () => {
  const world = problemReviewWorlds.find(
    ({ id }) => id === "problem-actual-log-unverified-original",
  )!;
  const report = {
    defect: "platform" as const,
    next: "prepare-local-draft" as const,
    basis: null,
    evidence: {
      selected: ["invocation-own"],
      incomplete: [],
      attribution: "unverified" as const,
    },
  };
  expect(verifyProblemWorld(world, report).passed).toBe(true);
  expect(
    verifyProblemWorld(world, {
      ...report,
      evidence: { ...report.evidence, attribution: "observed" },
    }).passed,
  ).toBe(false);
});
