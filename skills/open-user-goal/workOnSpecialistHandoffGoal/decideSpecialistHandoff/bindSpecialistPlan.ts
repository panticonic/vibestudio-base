import bindObservedSpecialistResult from "../bindObservedSpecialistResult.js";
import type {
  SpecialistIndex,
  SpecialistChoice,
  SpecialistSnapshot,
  ReceiptJoin,
  OriginalArtifact,
  HistoryReview,
  SpecialistHandoffIntent,
  SpecialistPlan,
} from "../types.js";
/** Immutable witness binding is exact TS; semantic code chooses the requested action and explanation. */
export default function bindSpecialistPlan(
  intent: SpecialistHandoffIntent,
  index: SpecialistIndex,
  choice: SpecialistChoice,
  current: SpecialistSnapshot,
  joined: ReceiptJoin,
  original: OriginalArtifact | null,
  history: HistoryReview | null,
): SpecialistPlan {
  if (!intent.explanation.trim() || current.channelId !== index.scope.channelId)
    throw Error(
      "A specialist plan needs an explanation in its exact observed scope",
    );
  const result = bindObservedSpecialistResult(
    index,
    choice,
    current,
    joined,
    original,
  );
  const reason =
    joined.reason === "verified" && !original
      ? "readback-unavailable"
      : joined.reason;
  if (
    intent.action === "stage" &&
    (!index.scope.mayStage || reason !== "verified" || !original || !history)
  )
    throw Error(
      "A specialist handoff needs current permission, original bytes and actual history evidence",
    );
  if (reason !== "verified" && intent.action !== "hold")
    throw Error(
      "Unsettled specialist evidence cannot be presented as usable work",
    );
  return {
    ...joined,
    reason,
    handle: choice.handle,
    channelId: index.scope.channelId,
    taskId: index.scope.taskId,
    through: current.through,
    sourceEvent: original ? (result?.sourceEvent ?? null) : null,
    artifact: original,
    action: intent.action,
    explanation: intent.explanation,
  };
}
