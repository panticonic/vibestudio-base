import { expect, it } from "vitest";
import { summarize } from "../templates/summarize.js";
import { verifyTemplateWorld } from "./verify.js";
import { templateLifecycleWorlds } from "./worlds.js";

it("qualifies pinned inspection reports against source inventory and rejects a changed commit", () => {
  const worlds = templateLifecycleWorlds.filter(
    (world) => world.request.kind === "inspect",
  );
  expect(worlds).toHaveLength(5);
  for (const world of worlds) {
    if (world.request.kind !== "inspect" || world.expected.kind !== "inspect")
      throw new Error(world.id);
    const summary = summarize(
      world.request.inspection,
      world.expected.summary.role,
    );
    expect(
      verifyTemplateWorld(world, { kind: "inspect", summary }).passed,
      world.id,
    ).toBe(true);
    expect(
      verifyTemplateWorld(world, {
        kind: "inspect",
        summary: { ...summary, commit: "wrong" },
      }).passed,
      world.id,
    ).toBe(false);
    expect(
      verifyTemplateWorld(
        { ...world, id: "alias" },
        { kind: "inspect", summary },
      ).passed,
    ).toBe(true);
  }
});
it("requires the real prepared operation and compatibility before a publish plan", () => {
  const world = templateLifecycleWorlds.find(
    ({ id }) => id === "template-foreign-epoch-confirmed-candidate",
  )!;
  const report = {
    kind: "update" as const,
    next: "ready-to-publish" as const,
    compatibility: "epoch-handoff" as const,
    basis: "review-rotation",
  };
  expect(verifyTemplateWorld(world, report).passed).toBe(true);
  expect(
    verifyTemplateWorld(world, { ...report, basis: "4a2b81e5c013" }).passed,
  ).toBe(false);
  expect(
    verifyTemplateWorld(world, { ...report, compatibility: "same-epoch" })
      .passed,
  ).toBe(false);
});
