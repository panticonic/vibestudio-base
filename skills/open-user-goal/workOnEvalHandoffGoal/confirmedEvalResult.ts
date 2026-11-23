import type { ConfirmedEvalResult, EvalRecoveryDecision, EvalTrial } from "./types.js";

const sha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);

/** Join selection to its original native trial, preserving both digest layers. */
export default function confirmedEvalResult(
  decision: EvalRecoveryDecision,
  trials: EvalTrial[]
): ConfirmedEvalResult | null {
  if (decision.action !== "use") return null;
  const matching = trials.filter((trial) => trial.observation.attempt.runId === decision.runId);
  const latest = matching.at(-1);
  if (!latest) return null;
  const { observation, review } = latest;
  // A repeated observation is harmless; one run cannot acquire different
  // immutable source/terminal receipts merely by being observed again.
  if (
    matching.some(
      (trial) =>
        trial.observation.jobId !== observation.jobId ||
        trial.observation.runDigest !== observation.runDigest ||
        trial.observation.resultDigest !== observation.resultDigest ||
        trial.observation.terminal !== observation.terminal
    )
  )
    return null;
  if (
    observation.attempt.authority !== "approved" ||
    observation.terminal === "cancelled" ||
    !sha256(observation.runDigest) ||
    !sha256(observation.resultDigest) ||
    review.runId !== decision.runId ||
    review.cell !== observation.terminal ||
    review.journal !== "matched" ||
    review.effect !== "confirmed" ||
    !review.readback ||
    !sha256(review.readback.digest) ||
    review.readback.observedDigest !== review.readback.digest ||
    !Number.isSafeInteger(review.readback.size) ||
    review.readback.size === null ||
    review.readback.size < 0
  )
    return null;
  // Keep the actual observation and review; a status tag is not a replacement
  // for their original run/result identities and independent byte readback.
  return { observation, review: review as ConfirmedEvalResult["review"] };
}
