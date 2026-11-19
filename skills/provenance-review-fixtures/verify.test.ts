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

it("keeps the attempted change and counts repeated reasons once", async () => {
  const { default: prepareConstraintQuestion } =
    await import("../provenance-orientation/reviewProvenance/reviewLiveHistory/assessProposedProperty/prepareConstraintQuestion.js");
  const authored = {
    label: "short timing policy",
    intent: "Keep the retry and socket waits short.",
    tier: "stated" as const,
    group: null,
    detail: null,
    boundary: null,
  };
  const reversal = {
    label: "revert",
    intent: "Staging cut the link while waiting.",
    tier: "stated" as const,
    detail: null,
    boundary: null,
  };
  const cause = {
    path: "retry.ts",
    walk: "cause" as const,
    scope: "work-unit" as const,
  };
  const cohort = { ...cause, walk: "cohort" as const };
  const rejection = { ...cause, walk: "rejections" as const };
  const result = prepareConstraintQuestion(
    {
      kind: "live-history",
      goal: "Review the wait",
      proposedProperty: "Set the backoff to five minutes",
      checks: [cause, cohort, rejection],
    },
    [
      {
        check: cause,
        exists: true,
        limited: false,
        records: [{ ...authored, ref: "cause", source: "source:1" }],
      },
      {
        check: cohort,
        exists: true,
        limited: false,
        records: [{ ...authored, ref: "cohort", source: "source:2" }],
      },
      {
        check: rejection,
        exists: true,
        limited: true,
        records: [
          {
            ...reversal,
            ref: "counteraction",
            source: "source:3",
            group: "counteractions",
            detail: "attempted: raise the ceiling to 300 seconds",
          },
          { ...reversal, ref: "revert", source: "source:3", group: "reverts" },
        ],
      },
    ],
  );
  expect(result.boundary).toBe("outside-visibility");
  expect(result.evidence.map(({ ref }) => ref)).toEqual([
    "cause",
    "counteraction",
  ]);
  expect(result.evidence[1]).toMatchObject({
    kind: "rejection",
    summary: expect.stringContaining("raise the ceiling to 300 seconds"),
  });
});
