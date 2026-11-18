import { expect, it } from "vitest";
import { runtimeEvidenceWorlds } from "./worlds.js";
import { verifyRuntimeEvidence } from "./verify.js";

it("does not accept a compile result as proof of a returned model answer", () => {
  const world = runtimeEvidenceWorlds.find(
    ({ id }) => id === "runtime-evidence-only-signatures-checked",
  )!;
  const report = {
    kind: "program" as const,
    next: "call-reviewed-signature" as const,
    basis: "skills/review/main.nl",
  };
  expect(verifyRuntimeEvidence(world, report).passed).toBe(true);
  expect(
    verifyRuntimeEvidence(world, { ...report, next: "verified" }).passed,
  ).toBe(false);
  expect(verifyRuntimeEvidence({ ...world, id: "alias" }, report).passed).toBe(
    true,
  );
});
