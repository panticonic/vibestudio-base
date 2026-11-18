import type {
  CandidateRequest,
  CandidateReview,
  CandidateState,
  StageReceipt,
} from "./types.js";

export function verify(
  request: CandidateRequest,
  receipt: StageReceipt,
  observed: CandidateState | null,
):
  | { state: "verified"; candidate: CandidateReview }
  | {
      state: "unconfirmed" | "stale-base";
      candidate: null;
    } {
  const review = observed?.review;
  if (
    receipt.outcome !== "acknowledged" ||
    !observed ||
    !review ||
    review.operationId !== request.commandId ||
    review.operationId !== receipt.review.operationId ||
    review.contextId !== receipt.review.contextId ||
    review.mainEventId !== receipt.review.mainEventId ||
    review.incomingCommit !== request.incomingCommit
  )
    return { state: "unconfirmed", candidate: null };
  if (review.state === "review") {
    if (!observed.mainEventId) return { state: "unconfirmed", candidate: null };
    if (review.mainEventId !== observed.mainEventId)
      return { state: "stale-base", candidate: null };
  }
  return { state: "verified", candidate: review };
}
