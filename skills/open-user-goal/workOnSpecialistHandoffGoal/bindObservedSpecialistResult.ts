import type {
  SpecialistIndex,
  SpecialistChoice,
  SpecialistSnapshot,
  ReceiptJoin,
  OriginalArtifact,
  Result,
} from "./types.js";
/** Exact binding of a positive join to the current observed assignment, scope and original bytes. */
export default function bindObservedSpecialistResult(
  index: SpecialistIndex,
  choice: SpecialistChoice,
  current: SpecialistSnapshot,
  joined: ReceiptJoin,
  original: OriginalArtifact | null,
): Result | null {
  if (current.channelId !== index.scope.channelId)
    throw Error("Specialist evidence crossed the owned channel");
  if (joined.reason !== "verified") {
    if (original)
      throw Error("Unverified specialist evidence cannot carry original bytes");
    return null;
  }
  const attempts = current.rows.filter(
    (row) =>
      row.record.kind === "attempt" && row.record.handle === choice.handle,
  );
  const latest = attempts.reduce<(typeof attempts)[number] | null>(
    (a, b) => (!a || b.seq > a.seq ? b : a),
    null,
  );
  if (
    !latest ||
    latest.messageId !== joined.attemptMessage ||
    latest.record.kind !== "attempt" ||
    latest.record.state !== "completed"
  )
    throw Error(
      "A verified specialist join needs the current completed assignment",
    );
  const attempt = latest.record;
  const results = current.rows.filter(
    (row) =>
      row.record.kind === "result" &&
      row.record.handle === choice.handle &&
      row.record.attemptId === attempt.attemptId,
  );
  const settled = results.reduce<(typeof results)[number] | null>(
    (a, b) => (!a || b.seq > a.seq ? b : a),
    null,
  );
  if (
    !settled ||
    settled.messageId !== joined.resultMessage ||
    settled.record.kind !== "result"
  )
    throw Error(
      "A verified specialist join needs the matching original result",
    );
  const result = settled.record,
    scope = index.scope;
  for (const value of [attempt, result])
    if (
      value.handle !== choice.handle ||
      value.contextId !== scope.contextId ||
      value.taskId !== scope.taskId ||
      value.parentRevision !== scope.parentRevision ||
      value.provider !== scope.requiredProvider ||
      value.participantId !== attempt.participantId
    )
      throw Error(
        "Specialist assignment/result provenance differs from the selected scope",
      );
  if (
    attempt.channelId !== scope.channelId ||
    result.sourceState !== "committed" ||
    !result.sourceEvent
  )
    throw Error(
      "A verified specialist result needs committed source in the owned channel",
    );
  if (original && original.digest !== result.digest)
    throw Error("Original specialist bytes belong to another result");
  return result;
}
