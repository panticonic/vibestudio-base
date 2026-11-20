import { expect, it } from "vitest";
import { createInMemorySql } from "@vibestudio/durable/test-utils";
import { createTrajectoryMirrorSchema } from "./trajectorySchema.js";
import {
  inspectTrajectoryNode,
  readHistoryMemoryCause,
  readHistoryWalkInvocation,
  trajectoryNeighborEdges,
} from "./trajectoryEvidence.js";

const timestamp = "2026-08-14T00:00:00.000Z";

it("reads a native invocation's causal evidence from trajectory tables alone", async () => {
  const sql = await createInMemorySql();
  createTrajectoryMirrorSchema(sql);
  sql.exec(`CREATE TABLE log_events (
    log_id TEXT NOT NULL, head TEXT NOT NULL, envelope_id TEXT NOT NULL,
    actor_json TEXT NOT NULL, payload_ref_json TEXT NOT NULL,
    PRIMARY KEY (log_id, head, envelope_id)
  )`);
  sql.exec(
    `INSERT INTO trajectory_invocations
       (log_id, head, invocation_id, turn_id, kind, status, terminal_outcome, updated_at)
     VALUES ('log:one', 'main', 'invocation:one', 'turn:one', 'edit', 'completed', 'succeeded', ?)`,
    timestamp,
  );
  sql.exec(
    `INSERT INTO trajectory_turns (log_id, head, turn_id, opened_at, summary, ordinal, trigger_message_id)
     VALUES ('log:one', 'main', 'turn:one', ?, 'Change the config', 0, 'message:request')`,
    timestamp,
  );
  sql.exec(
    `INSERT INTO trajectory_messages (log_id, head, message_id, role, status, completed_event_id, updated_at)
     VALUES ('log:one', 'main', 'message:request', 'user', 'completed', 'event:statement', ?)`,
    timestamp,
  );
  sql.exec(
    `INSERT INTO log_events VALUES ('log:one', 'main', 'event:statement', ?, ?)`,
    JSON.stringify({ kind: "user", id: "user:alice" }),
    JSON.stringify({
      blocks: [{ type: "text", content: "Change the config" }],
    }),
  );
  const invocation = {
    logId: "log:one",
    head: "main",
    invocationId: "invocation:one",
  };
  expect(readHistoryMemoryCause(sql, invocation)).toMatchObject({
    invocation: { kind: "trajectory-invocation", ...invocation },
    triggerText: "Change the config",
    sender: { kind: "user", id: "user:alice" },
  });
  const root = { kind: "trajectory-invocation", ...invocation };
  expect(inspectTrajectoryNode(sql, root)).toMatchObject({
    kind: root.kind,
    value: invocation,
  });
  const edges = trajectoryNeighborEdges(sql, root, { phase: 0, key: null }, 10);
  expect(edges.map(({ edge }) => edge["kind"])).toEqual([
    "part-of-trajectory",
    "part-of-turn",
  ]);
  expect(trajectoryNeighborEdges(sql, root, edges[0]!.position, 1)).toEqual(
    edges.slice(1),
  );
  expect(readHistoryWalkInvocation(sql, invocation).entries).toMatchObject([
    { node: { kind: "trajectory-invocation" }, depth: 0 },
    { node: { kind: "trajectory-turn" }, depth: 1 },
    {
      node: { kind: "trajectory-message" },
      depth: 2,
      boundary: "human-statement",
      statement: { text: "Change the config", sender: "user" },
    },
  ]);

  sql.exec(
    `INSERT INTO trajectory_invocations
       (log_id, head, invocation_id, kind, status, started_event_id, updated_at)
     VALUES ('log:outside', 'main', 'invocation:outside', 'edit', 'started', 'event:outside', ?)`,
    timestamp,
  );
  sql.exec(
    `INSERT INTO log_events VALUES ('log:outside', 'main', 'event:outside', '{}', ?)`,
    JSON.stringify({
      nativeSource: {},
      originatingInput: {
        channelRef: { objectKey: "log:one" },
        messageId: "message:request",
      },
    }),
  );
  const message = {
    kind: "trajectory-message",
    logId: "log:one",
    head: "main",
    messageId: "message:request",
  };
  const messageEdges = trajectoryNeighborEdges(
    sql,
    message,
    { phase: 0, key: null },
    10,
  );
  expect(messageEdges.map(({ edge }) => edge)).toContainEqual({
    kind: "triggered-by",
    from: {
      kind: "trajectory-turn",
      logId: "log:one",
      head: "main",
      turnId: "turn:one",
    },
    to: message,
  });
  expect(messageEdges.map(({ edge }) => edge)).not.toContainEqual({
    kind: "triggered-by",
    from: {
      kind: "trajectory-invocation",
      logId: "log:outside",
      head: "main",
      invocationId: "invocation:outside",
    },
    to: message,
  });
});
