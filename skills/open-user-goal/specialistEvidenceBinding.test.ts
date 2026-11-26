import { expect, it } from "vitest";
import bindEvidence from "./workOnSpecialistHandoffGoal/reviewSpecialistCandidate/bindSpecialistEvidence.js";
import bindPlan from "./workOnSpecialistHandoffGoal/decideSpecialistHandoff/bindSpecialistPlan.js";
const scope = {
  channelId: "owned-channel",
  contextId: "owned-context",
  taskId: "owned-task",
  concern: "reply state",
  parentRevision: "native-parent",
  requiredProvider: "local",
  mayStage: false,
};
const index = { scope, agents: [] },
  choice = { handle: "@actual", reason: "chosen" as const };
const attempt = {
  kind: "attempt" as const,
  handle: "@actual",
  participantId: "native-participant",
  contextId: scope.contextId,
  channelId: scope.channelId,
  taskId: scope.taskId,
  attemptId: "native-attempt",
  provider: "local",
  parentRevision: scope.parentRevision,
  state: "completed" as const,
};
const record = {
  kind: "result" as const,
  handle: "@actual",
  participantId: attempt.participantId,
  contextId: scope.contextId,
  taskId: scope.taskId,
  attemptId: attempt.attemptId,
  provider: "local",
  parentRevision: scope.parentRevision,
  sourceEvent: "original-committed-event",
  sourceState: "committed" as const,
  owner: "workers/agent-worker" as const,
  consumers: [],
  digest: "native-original-digest",
};
const current = {
  channelId: scope.channelId,
  through: 2,
  rows: [
    {
      messageId: "attempt",
      envelopeId: "attempt-envelope",
      seq: 1,
      record: attempt,
    },
    { messageId: "result", envelopeId: "result-envelope", seq: 2, record },
  ],
};
const joined = {
    attemptMessage: "attempt",
    resultMessage: "result",
    reason: "verified" as const,
  },
  original = {
    text: "native original bytes",
    digest: record.digest,
    bytes: 21,
  };
it("joins a semantic report intent to exact observed IDs/source/bytes without reconstructing them", () => {
  const value = bindPlan(
    {
      action: "report",
      explanation: "This actual committed result is available read-only.",
    },
    index,
    choice,
    current,
    joined,
    original,
    null,
  );
  expect(value).toMatchObject({
    channelId: scope.channelId,
    taskId: scope.taskId,
    sourceEvent: record.sourceEvent,
    through: 2,
    artifact: original,
    action: "report",
  });
  expect(value.artifact).toBe(original);
});
it("rejects a changed owned channel, foreign original digest and newer uncompleted assignment", () => {
  expect(() =>
    bindEvidence(
      index,
      choice,
      { ...current, channelId: "foreign" },
      null,
      joined,
      original,
    ),
  ).toThrow("owned channel");
  expect(() =>
    bindEvidence(index, choice, current, null, joined, {
      ...original,
      digest: "different",
    }),
  ).toThrow("another result");
  const changed = {
    ...current,
    through: 3,
    rows: [
      ...current.rows,
      {
        messageId: "new-attempt",
        envelopeId: "new-envelope",
        seq: 3,
        record: {
          ...attempt,
          attemptId: "new-assignment",
          state: "running" as const,
        },
      },
    ],
  };
  expect(() =>
    bindEvidence(index, choice, changed, null, joined, original),
  ).toThrow("current completed assignment");
});
it("refuses an unauthorized write and a report that promotes an unavailable original", () => {
  expect(() =>
    bindPlan(
      { action: "stage", explanation: "Write" },
      index,
      choice,
      current,
      joined,
      original,
      null,
    ),
  ).toThrow("current permission");
  expect(() =>
    bindPlan(
      { action: "report", explanation: "Use it" },
      index,
      choice,
      current,
      joined,
      null,
      null,
    ),
  ).toThrow("Unsettled");
});
