import { expect, it } from "vitest";
import confirmedEvalResult from "./workOnEvalHandoffGoal/confirmedEvalResult.js";
import type { EvalTrial } from "../open-eval-handoff/types.js";
function trial(): EvalTrial {
  return {
    observation: {
      jobId: "owned-job",
      attempt: { runId: "original-run", role: "latest", label: "Closeout", authority: "approved" },
      terminal: "failed",
      runDigest: "a".repeat(64),
      resultDigest: "b".repeat(64),
      exactRetryAuthorized: false,
      request: { goal: "Leave verified stored bytes in scratch", operationId: "original-review" },
    },
    review: {
      runId: "original-run",
      cell: "failed",
      journal: "matched",
      readback: { digest: "c".repeat(64), observedDigest: "c".repeat(64), size: 102 },
      effect: "confirmed",
      next: "continue-with-effect",
      reason: "Original failed cell has independently verified committed bytes.",
    },
  };
}
const use = { action: "use" as const, runId: "original-run" };
it("carries exact native provenance across failed-cell and verified-effect boundaries", () => {
  const original = trial(),
    before = JSON.stringify(original);
  const result = confirmedEvalResult(use, [original]);
  expect(result?.observation).toBe(original.observation);
  expect(result?.review).toBe(original.review);
  expect(JSON.stringify(original)).toBe(before);
  // Receipt and content hashes describe different layers; don't equate them.
  expect(result?.observation.resultDigest).not.toBe(result?.review.readback.digest);
});
it("does not manufacture confirmation from a use decision without actual matching evidence", () => {
  expect(confirmedEvalResult(use, [])).toBeNull();
  for (const mutate of [
    (t: EvalTrial) => {
      t.observation.attempt.authority = "withdrawn";
    },
    (t: EvalTrial) => {
      t.observation.terminal = "cancelled";
    },
    (t: EvalTrial) => {
      t.observation.resultDigest = null;
    },
    (t: EvalTrial) => {
      t.review.runId = "foreign-run";
    },
    (t: EvalTrial) => {
      t.review.cell = "returned";
    },
    (t: EvalTrial) => {
      t.review.journal = "mismatch";
    },
    (t: EvalTrial) => {
      t.review.effect = "unchecked";
    },
    (t: EvalTrial) => {
      t.review.readback = null;
    },
    (t: EvalTrial) => {
      t.review.readback!.observedDigest = "d".repeat(64);
    },
    (t: EvalTrial) => {
      t.review.readback!.size = null;
    },
  ]) {
    const changed = trial();
    mutate(changed);
    expect(confirmedEvalResult(use, [changed])).toBeNull();
  }
  expect(confirmedEvalResult({ action: "retry", runId: use.runId }, [trial()])).toBeNull();
  expect(
    confirmedEvalResult({ action: "hold", reason: "no-confirmed-effect" }, [trial()])
  ).toBeNull();
});
it("accepts repeated observations and rejects contradictory immutable receipts", () => {
  const first = trial(),
    again = structuredClone(first);
  expect(confirmedEvalResult(use, [first, again])?.observation).toBe(again.observation);
  again.observation.runDigest = "e".repeat(64);
  expect(confirmedEvalResult(use, [first, again])).toBeNull();
});
