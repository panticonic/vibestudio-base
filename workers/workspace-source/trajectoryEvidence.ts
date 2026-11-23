import type { SqlStorage } from "@vibestudio/durable";
import {
  nativeInvocationIdentity,
  nativeInvocationSourceSchema,
  nativeOriginatingInputSchema,
} from "@vibestudio/service-schemas/nativeInvocation";
import { vcsTrajectoryRequestRefSchema, vcsTrajectorySenderRefSchema } from "@vibestudio/service-schemas/vcs";
import { channelTrajectoryFor } from "@vibestudio/trajectory-identity";
import { SemanticVcsError } from "./semanticVcsErrors.js";

type Row = Record<string, unknown>;
type WalkPage = { entries: Row[]; notes: string[] };
const MAX_CAUSE_MESSAGE_HOPS = 8;

export const boundedMemoryText = (value: string, maximum: number): string | null => {
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.length <= maximum
    ? normalized
    : `${normalized.slice(0, Math.max(0, maximum - 1)).trimEnd()}…`;
};

export const trajectorySenderRef = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Row;
  const parsed = vcsTrajectorySenderRefSchema.safeParse({
    kind: candidate["kind"],
    id: candidate["id"],
    participantId:
      typeof candidate["participantId"] === "string"
        ? candidate["participantId"]
        : null,
  });
  return parsed.success ? parsed.data : null;
};

export const trajectoryRequestRef = (value: unknown) => {
  const parsed = vcsTrajectoryRequestRefSchema.safeParse(value);
  if (!parsed.success) {
    throw new SemanticVcsError(
      "IntegrityFailure",
      "Invalid canonical invocation request reference",
    );
  }
  return parsed.data;
};

/** Hydrate a recorded invocation, including the exact channel of a native originating input. */
export function readRecordedMemoryCause(
  sql: SqlStorage,
  { logId, head, invocationId }: { logId: string; head: string; invocationId: string },
  inspectMessage: (node: { kind: "trajectory-message"; logId: string; head: string; messageId: string }) => Row | null,
): Row | null {
  const row = sql.exec(
    `SELECT invocation.turn_id, invocation.kind AS tool_name,
            invocation.terminal_outcome, invocation.request_ref_json,
            turn.summary AS turn_summary, turn.trigger_message_id,
            started.payload_ref_json AS started_payload_json
       FROM (SELECT ? AS log_id, ? AS head, ? AS invocation_id) AS cause
       LEFT JOIN trajectory_invocations invocation USING (log_id, head, invocation_id)
       LEFT JOIN trajectory_turns turn
         ON turn.log_id = invocation.log_id AND turn.head = invocation.head
        AND turn.turn_id = invocation.turn_id
       LEFT JOIN log_events started
         ON started.log_id = invocation.log_id AND started.head = invocation.head
        AND started.envelope_id = invocation.started_event_id`,
    logId, head, invocationId,
  ).toArray()[0] as Row;
  if (!row) {
    return null;
  }
  const turnId = row["turn_id"] == null ? null : String(row["turn_id"]);
  const startedPayload =
    row["started_payload_json"] == null
      ? null
      : (JSON.parse(String(row["started_payload_json"])) as Row);
  const nativeSource =
    startedPayload?.["nativeSource"] === undefined
      ? null
      : nativeInvocationSourceSchema.parse(startedPayload["nativeSource"]);
  const originatingInput =
    nativeSource === null
      ? null
      : nativeOriginatingInputSchema
          .nullable()
          .parse(startedPayload!["originatingInput"]);
  const messageLogId = originatingInput?.channelRef.objectKey ?? logId;
  const messageHead = originatingInput
    ? channelTrajectoryFor(messageLogId).head
    : head;
  const messageId =
    nativeSource !== null
      ? (originatingInput?.messageId ?? null)
      : row["trigger_message_id"] == null
        ? null
        : String(row["trigger_message_id"]);
  let triggerText: string | null = null;
  let sender: unknown = null;
  if (messageId) {
    const message = inspectMessage({
      kind: "trajectory-message",
      logId: messageLogId,
      head: messageHead,
      messageId,
    });
    if (message) {
      const blocks = Array.isArray(message["textBlocks"])
        ? (message["textBlocks"] as Row[])
        : [];
      triggerText = boundedMemoryText(
        blocks.map((block) => String(block["content"] ?? "")).join("\n"),
        1_200,
      );
      sender = message["senderRef"] ?? null;
    }
  }
  return {
    invocation: { kind: "trajectory-invocation", logId, head, invocationId },
    nativeInvocation:
      nativeSource === null ? null : nativeInvocationIdentity(nativeSource),
    originatingInput,
    turn: turnId ? { kind: "trajectory-turn", logId, head, turnId } : null,
    message: messageId
      ? {
          kind: "trajectory-message",
          logId: messageLogId,
          head: messageHead,
          messageId,
        }
      : null,
    toolName: row["tool_name"] == null ? null : String(row["tool_name"]),
    terminalOutcome:
      row["terminal_outcome"] == null
        ? null
        : String(row["terminal_outcome"]),
    requestRef:
      row["request_ref_json"] == null
        ? null
        : trajectoryRequestRef(JSON.parse(String(row["request_ref_json"]))),
    turnSummary: boundedMemoryText(
      row["turn_summary"] == null ? "" : String(row["turn_summary"]),
      600,
    ),
    triggerText,
    sender,
  };
}

export function readTrajectoryMessage(sql: SqlStorage, logId: string, head: string, messageId: string) {
  const row = sql
    .exec(
      `SELECT turn_id, role, status, started_event_id, completed_event_id
         FROM trajectory_messages
        WHERE log_id = ? AND head = ? AND message_id = ? LIMIT 1`,
      logId,
      head,
      messageId,
    )
    .toArray()[0];
  if (!row) return null;
  const payloadEventId =
    row["completed_event_id"] ?? row["started_event_id"];
  const payloadRow =
    payloadEventId == null
      ? undefined
      : sql
          .exec(
            `SELECT actor_json, payload_ref_json FROM log_events
              WHERE log_id = ? AND head = ? AND envelope_id = ? LIMIT 1`,
            logId,
            head,
            String(payloadEventId),
          )
          .toArray()[0];
  const payload = payloadRow
    ? (JSON.parse(String(payloadRow["payload_ref_json"])) as Row)
    : {};
  const eventActor = payloadRow ? JSON.parse(String(payloadRow["actor_json"])) : null;
  const senderRef = trajectorySenderRef(payload["senderRef"] ?? eventActor);
  const textBlocks = (Array.isArray(payload["blocks"]) ? payload["blocks"] : []).flatMap(
    (value, index) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const block = value as Row;
      if (block["type"] !== "text" || typeof block["content"] !== "string") return [];
      return [{
        blockId: typeof block["blockId"] === "string" ? block["blockId"] : `${messageId}:block:${index}`,
        content: block["content"],
      }];
    }
  );
  return {
    logId,
    head,
    messageId,
    turnId: row["turn_id"] == null ? null : String(row["turn_id"]),
    role: String(row["role"]),
    status: String(row["status"]),
    startedEventId:
      row["started_event_id"] == null
        ? null
        : String(row["started_event_id"]),
    completedEventId:
      row["completed_event_id"] == null
        ? null
        : String(row["completed_event_id"]),
    sourceMessageId:
      typeof payload["sourceMessageId"] === "string"
        ? payload["sourceMessageId"]
        : null,
    senderRef,
    textBlocks,
  };
}

export function readTrajectoryMessageExcerpt(sql: SqlStorage, logId: string, head: string, messageId: string) {
  try {
    return readTrajectoryMessage(sql, logId, head, messageId);
  } catch {
    return null;
  }
}

export function readHistoryMemoryCause(
  sql: SqlStorage,
  invocation: { logId: string; head: string; invocationId: string },
) {
  return readRecordedMemoryCause(sql, invocation, (node) =>
    readTrajectoryMessageExcerpt(sql, node.logId, node.head, node.messageId)
  );
}

export function readHistoryWalkInvocation(
  sql: SqlStorage,
  invocation: { logId: string; head: string; invocationId: string },
): WalkPage {
  const cause = readHistoryMemoryCause(sql, invocation);
  return cause ? walkTrajectoryInvocation(sql, cause, 0) : { entries: [], notes: [] };
}

export function walkTrajectoryInvocation(sql: SqlStorage, cause: Row, depth: number): WalkPage {
  const entries: Row[] = [];
  const notes: string[] = [];
  const invocation = cause["invocation"] as Row;
  entries.push({
    node: invocation,
    label: `tool invocation · ${cause["toolName"] == null ? "unnamed" : String(cause["toolName"])}`,
    depth,
    ...(cause["terminalOutcome"] == null
      ? {}
      : { detail: `outcome ${String(cause["terminalOutcome"])}` }),
  });
  depth += 1;
  const turn = cause["turn"] as Row | null;
  if (turn) {
    entries.push({
      node: turn,
      label: "turn",
      depth,
      ...(cause["turnSummary"] == null
        ? {}
        : {
            detail:
              boundedMemoryText(String(cause["turnSummary"]), 300) ?? "",
          }),
    });
    depth += 1;
  }
  let message = cause["message"] as Row | null;
  const seen = new Set<string>();
  for (let hop = 0; message && hop < MAX_CAUSE_MESSAGE_HOPS; hop += 1) {
    const logId = String(message["logId"]);
    const head = String(message["head"]);
    const messageId = String(message["messageId"]);
    if (seen.has(messageId)) break;
    seen.add(messageId);
    const value = readTrajectoryMessageExcerpt(sql, logId, head, messageId);
    if (!value) break;
    const sender = value["senderRef"] as Row | null;
    const senderKind = sender ? String(sender["kind"]) : null;
    const role = String(value["role"] ?? "");
    const text = (
      Array.isArray(value["textBlocks"]) ? (value["textBlocks"] as Row[]) : []
    )
      .map((block) => String(block["content"] ?? ""))
      .join("\n");
    const human =
      senderKind === "user" || (senderKind === null && role === "user");
    const statementText = boundedMemoryText(text, 2_000);
    entries.push({
      node: message,
      label: `message · ${role}${senderKind ? ` from ${senderKind}` : ""}`,
      depth,
      // Causal message prose is evidence regardless of sender kind. An
      // external client can carry the originating request without proving
      // that the sender is human; preserve its text and the actual boundary
      // independently.
      ...(statementText
        ? {
            statement: {
              text: statementText,
              sender: senderKind ?? role ?? "requester",
            },
          }
        : {}),
      ...(human
        ? { boundary: "human-statement" as const }
        : senderKind === "agent"
          ? { boundary: "subagent-brief" as const }
          : {}),
    });
    depth += 1;
    if (human || senderKind === "agent") break;
    const sourceMessageId =
      typeof value["sourceMessageId"] === "string"
        ? value["sourceMessageId"]
        : null;
    message = sourceMessageId
      ? {
          kind: "trajectory-message",
          logId,
          head,
          messageId: sourceMessageId,
        }
      : null;
    if (!message) {
      notes.push("The chain ends at a message with no recorded source.");
    }
  }
  return { entries, notes };
}

export function inspectTrajectoryNode(sql: SqlStorage, node: Row): Row {
  switch (node["kind"]) {
    case "trajectory":
      return { kind: "trajectory", value: node };
    case "trajectory-invocation": {
      const row = sql
        .exec(
          `SELECT turn_id, kind, status, terminal_outcome, request_ref_json,
                  started_event_id, completed_event_id
             FROM trajectory_invocations
            WHERE log_id = ? AND head = ? AND invocation_id = ? LIMIT 1`,
          String(node["logId"]),
          String(node["head"]),
          String(node["invocationId"]),
        )
        .toArray()[0];
      if (!row)
        throw new SemanticVcsError(
          "InvalidReference",
          "Unknown trajectory invocation",
        );
      const started =
        row["started_event_id"] == null
          ? null
          : sql
              .exec(
                "SELECT payload_ref_json FROM log_events WHERE log_id=? AND head=? AND envelope_id=? LIMIT 1",
                String(node["logId"]),
                String(node["head"]),
                String(row["started_event_id"]),
              )
              .toArray()[0];
      const payload =
        started == null
          ? null
          : (JSON.parse(String(started["payload_ref_json"])) as Row);
      const nativeSource =
        payload?.["nativeSource"] === undefined
          ? null
          : nativeInvocationSourceSchema.parse(payload["nativeSource"]);
      return {
        kind: "trajectory-invocation",
        value: {
          logId: String(node["logId"]),
          head: String(node["head"]),
          invocationId: String(node["invocationId"]),
          nativeInvocation:
            nativeSource === null
              ? null
              : nativeInvocationIdentity(nativeSource),
          originatingInput:
            nativeSource === null
              ? null
              : nativeOriginatingInputSchema
                  .nullable()
                  .parse(payload!["originatingInput"]),
          turnId: row["turn_id"] == null ? null : String(row["turn_id"]),
          name: row["kind"] == null ? null : String(row["kind"]),
          status: String(row["status"]),
          terminalOutcome:
            row["terminal_outcome"] == null
              ? null
              : String(row["terminal_outcome"]),
          requestRef:
            row["request_ref_json"] == null
              ? null
              : trajectoryRequestRef(
                  JSON.parse(String(row["request_ref_json"])),
                ),
          startedEventId:
            row["started_event_id"] == null
              ? null
              : String(row["started_event_id"]),
          completedEventId:
            row["completed_event_id"] == null
              ? null
              : String(row["completed_event_id"]),
        },
      };
    }
    case "trajectory-turn": {
      const row = sql
        .exec(
          `SELECT trigger_message_id, opened_at, closed_at, summary, ordinal
             FROM trajectory_turns
            WHERE log_id = ? AND head = ? AND turn_id = ? LIMIT 1`,
          String(node["logId"]),
          String(node["head"]),
          String(node["turnId"]),
        )
        .toArray()[0];
      if (!row)
        throw new SemanticVcsError(
          "InvalidReference",
          "Unknown trajectory turn",
        );
      return {
        kind: "trajectory-turn",
        value: {
          logId: String(node["logId"]),
          head: String(node["head"]),
          turnId: String(node["turnId"]),
          triggerMessageId:
            row["trigger_message_id"] == null
              ? null
              : String(row["trigger_message_id"]),
          openedAt:
            row["opened_at"] == null ? null : String(row["opened_at"]),
          closedAt:
            row["closed_at"] == null ? null : String(row["closed_at"]),
          summary: row["summary"] == null ? null : String(row["summary"]),
          ordinal: row["ordinal"] == null ? null : Number(row["ordinal"]),
        },
      };
    }
    case "trajectory-message": {
      const value = readTrajectoryMessage(
        sql, String(node["logId"]), String(node["head"]), String(node["messageId"]),
      );
      if (!value) throw new SemanticVcsError("InvalidReference", "Unknown trajectory message");
      return { kind: "trajectory-message", value };
    }
    default:
      throw new SemanticVcsError("InvalidReference", "Unknown trajectory node kind");
  }
}

export function trajectoryNeighborEdges(
  sql: SqlStorage,
  node: Row,
  after: Readonly<{ phase: number; key: string | null }>,
  limit: number,
): Array<{ position: { phase: number; key: string }; edge: Row }> {
  const kind = node["kind"];
  if (kind === "trajectory-invocation") {
    const invocation = {
      kind: "trajectory-invocation",
      logId: node["logId"],
      head: node["head"],
      invocationId: node["invocationId"],
    };
    const invocationRow = sql
      .exec(
        `SELECT turn_id FROM trajectory_invocations
          WHERE log_id = ? AND head = ? AND invocation_id = ? LIMIT 1`,
        String(node["logId"]),
        String(node["head"]),
        String(node["invocationId"]),
      )
      .toArray()[0] as Row | undefined;
    if (!invocationRow) {
      throw new SemanticVcsError(
        "InvalidReference",
        "Unknown trajectory invocation",
      );
    }
    const rows = sql
      .exec(
        `SELECT edge_group, sort_key, edge_kind, target_id, input_log_id, input_head FROM (
           SELECT 0 AS edge_group, '' AS sort_key, 'part-of-trajectory' AS edge_kind,
                  invocation_id AS target_id, NULL AS input_log_id, NULL AS input_head
             FROM trajectory_invocations
            WHERE log_id = ? AND head = ? AND invocation_id = ?
           UNION ALL
           SELECT 1, turn_id, 'part-of-turn', turn_id, NULL, NULL
             FROM trajectory_invocations
            WHERE log_id = ? AND head = ? AND invocation_id = ? AND turn_id IS NOT NULL
           UNION ALL
           SELECT 3, input_message_id, 'triggered-by', input_message_id, input_log_id, input_head
             FROM trajectory_invocation_inputs
            WHERE log_id = ? AND head = ? AND invocation_id = ?
              AND input_log_id = log_id AND input_head = head
         ) adjacency
         WHERE edge_group > ?
            OR (edge_group = ? AND (? IS NULL OR sort_key > ?))
         ORDER BY edge_group, sort_key, target_id LIMIT ?`,
        String(node["logId"]),
        String(node["head"]),
        String(node["invocationId"]),
        String(node["logId"]),
        String(node["head"]),
        String(node["invocationId"]),
        String(node["logId"]),
        String(node["head"]),
        String(node["invocationId"]),
        after.phase,
        after.phase,
        after.key,
        after.key,
        limit,
      )
      .toArray() as Row[];
    return rows.map((row) => {
      const edgeKind = String(row["edge_kind"]);
      const targetId = String(row["target_id"]);
      return {
        position: {
          phase: Number(row["edge_group"]),
          key: String(row["sort_key"]),
        },
        edge:
          edgeKind === "part-of-trajectory"
            ? {
                kind: edgeKind,
                from: invocation,
                to: {
                  kind: "trajectory",
                  logId: node["logId"],
                  head: node["head"],
                },
              }
            : edgeKind === "part-of-turn"
              ? {
                  kind: edgeKind,
                  from: invocation,
                  to: {
                    kind: "trajectory-turn",
                    logId: node["logId"],
                    head: node["head"],
                    turnId: targetId,
                  },
                }
              : {
                  kind: "triggered-by",
                  from: invocation,
                  to: {
                    kind: "trajectory-message",
                    logId: String(row["input_log_id"]),
                    head: String(row["input_head"]),
                    messageId: targetId,
                  },
                },
      };
    });
  } else if (kind === "trajectory-turn") {
    const turn = {
      kind: "trajectory-turn",
      logId: node["logId"],
      head: node["head"],
      turnId: node["turnId"],
    };
    const turnRow = sql
      .exec(
        `SELECT trigger_message_id FROM trajectory_turns
          WHERE log_id = ? AND head = ? AND turn_id = ? LIMIT 1`,
        String(node["logId"]),
        String(node["head"]),
        String(node["turnId"]),
      )
      .toArray()[0] as Row | undefined;
    if (!turnRow)
      throw new SemanticVcsError(
        "InvalidReference",
        "Unknown trajectory turn",
      );
    const rows = sql
      .exec(
        `SELECT edge_group, sort_key, edge_kind, target_id FROM (
           SELECT 0 AS edge_group, '' AS sort_key, 'part-of-trajectory' AS edge_kind,
                  turn_id AS target_id
             FROM trajectory_turns WHERE log_id = ? AND head = ? AND turn_id = ?
           UNION ALL
           SELECT 1, trigger_message_id, 'triggered-by', trigger_message_id
             FROM trajectory_turns
            WHERE log_id = ? AND head = ? AND turn_id = ? AND trigger_message_id IS NOT NULL
           UNION ALL
           SELECT 2, invocation_id, 'part-of-turn', invocation_id
             FROM trajectory_invocations WHERE log_id = ? AND head = ? AND turn_id = ?
           UNION ALL
           SELECT 3, message_id, 'turn-message', message_id
             FROM trajectory_messages WHERE log_id = ? AND head = ? AND turn_id = ?
         ) adjacency
         WHERE edge_group > ?
            OR (edge_group = ? AND (? IS NULL OR sort_key > ?))
         ORDER BY edge_group, sort_key, target_id LIMIT ?`,
        String(node["logId"]),
        String(node["head"]),
        String(node["turnId"]),
        String(node["logId"]),
        String(node["head"]),
        String(node["turnId"]),
        String(node["logId"]),
        String(node["head"]),
        String(node["turnId"]),
        String(node["logId"]),
        String(node["head"]),
        String(node["turnId"]),
        after.phase,
        after.phase,
        after.key,
        after.key,
        limit,
      )
      .toArray() as Row[];
    return rows.map((row) => {
      const edgeKind = String(row["edge_kind"]);
      const targetId = String(row["target_id"]);
      return {
        position: {
          phase: Number(row["edge_group"]),
          key: String(row["sort_key"]),
        },
        edge:
          edgeKind === "part-of-trajectory"
            ? {
                kind: edgeKind,
                from: turn,
                to: {
                  kind: "trajectory",
                  logId: node["logId"],
                  head: node["head"],
                },
              }
            : edgeKind === "triggered-by"
              ? {
                  kind: edgeKind,
                  from: turn,
                  to: {
                    kind: "trajectory-message",
                    logId: node["logId"],
                    head: node["head"],
                    messageId: targetId,
                  },
                }
              : edgeKind === "part-of-turn"
                ? {
                    kind: edgeKind,
                    from: {
                      kind: "trajectory-invocation",
                      logId: node["logId"],
                      head: node["head"],
                      invocationId: targetId,
                    },
                    to: turn,
                  }
                : {
                    kind: "part-of-turn",
                    from: {
                      kind: "trajectory-message",
                      logId: node["logId"],
                      head: node["head"],
                      messageId: targetId,
                    },
                    to: turn,
                  },
      };
    });
  } else if (kind === "trajectory-message") {
    const message = {
      kind: "trajectory-message",
      logId: node["logId"],
      head: node["head"],
      messageId: node["messageId"],
    };
    const messageRow = sql
      .exec(
        `SELECT turn_id FROM trajectory_messages
          WHERE log_id = ? AND head = ? AND message_id = ? LIMIT 1`,
        String(node["logId"]),
        String(node["head"]),
        String(node["messageId"]),
      )
      .toArray()[0] as Row | undefined;
    if (!messageRow) {
      throw new SemanticVcsError(
        "InvalidReference",
        "Unknown trajectory message",
      );
    }
    const rows = sql
      .exec(
        `SELECT edge_group, sort_key, edge_kind, target_id, target_kind, target_log_id, target_head FROM (
           SELECT 0 AS edge_group, '' AS sort_key, 'part-of-trajectory' AS edge_kind,
                  message_id AS target_id, 'trajectory' AS target_kind, NULL AS target_log_id, NULL AS target_head
             FROM trajectory_messages WHERE log_id = ? AND head = ? AND message_id = ?
           UNION ALL
           SELECT 1, turn_id, 'part-of-turn', turn_id, 'turn', NULL, NULL
             FROM trajectory_messages
            WHERE log_id = ? AND head = ? AND message_id = ? AND turn_id IS NOT NULL
           UNION ALL
           SELECT 2, turn_id, 'triggered-by', turn_id, 'turn', NULL, NULL
             FROM trajectory_turns
            WHERE log_id = ? AND head = ? AND trigger_message_id = ?
           UNION ALL
           SELECT 3, json_array(log_id, head, invocation_id), 'triggered-by', invocation_id,
                  'invocation', log_id, head
             FROM trajectory_invocation_inputs
            WHERE input_log_id = ? AND input_head = ? AND input_message_id = ?
              AND log_id = input_log_id AND head = input_head
         ) adjacency
         WHERE edge_group > ?
            OR (edge_group = ? AND (? IS NULL OR sort_key > ?))
         ORDER BY edge_group, sort_key, target_id LIMIT ?`,
        String(node["logId"]),
        String(node["head"]),
        String(node["messageId"]),
        String(node["logId"]),
        String(node["head"]),
        String(node["messageId"]),
        String(node["logId"]),
        String(node["head"]),
        String(node["messageId"]),
        String(node["logId"]),
        String(node["head"]),
        String(node["messageId"]),
        after.phase,
        after.phase,
        after.key,
        after.key,
        limit,
      )
      .toArray() as Row[];
    return rows.map((row) => {
      const edgeKind = String(row["edge_kind"]);
      const targetId = String(row["target_id"]);
      return {
        position: {
          phase: Number(row["edge_group"]),
          key: String(row["sort_key"]),
        },
        edge:
          edgeKind === "part-of-trajectory"
            ? {
                kind: edgeKind,
                from: message,
                to: {
                  kind: "trajectory",
                  logId: node["logId"],
                  head: node["head"],
                },
              }
            : edgeKind === "part-of-turn"
              ? {
                  kind: edgeKind,
                  from: message,
                  to: {
                    kind: "trajectory-turn",
                    logId: node["logId"],
                    head: node["head"],
                    turnId: targetId,
                  },
                }
              : row["target_kind"] === "invocation"
                ? {
                    kind: edgeKind,
                    from: {
                      kind: "trajectory-invocation",
                      logId: String(row["target_log_id"]),
                      head: String(row["target_head"]),
                      invocationId: targetId,
                    },
                    to: message,
                  }
                : {
                    kind: edgeKind,
                    from: {
                      kind: "trajectory-turn",
                      logId: node["logId"],
                      head: node["head"],
                      turnId: targetId,
                    },
                    to: message,
                  },
      };
    });
  } else if (kind === "trajectory") {
    const trajectory = {
      kind: "trajectory",
      logId: node["logId"],
      head: node["head"],
    };
    const members = sql
      .exec(
        `SELECT edge_group, sort_key, member_kind, member_id FROM (
           SELECT 0 AS edge_group, invocation_id AS sort_key,
                  'trajectory-invocation' AS member_kind, invocation_id AS member_id
             FROM trajectory_invocations WHERE log_id = ? AND head = ?
           UNION ALL
           SELECT 1, message_id, 'trajectory-message', message_id
             FROM trajectory_messages WHERE log_id = ? AND head = ?
           UNION ALL
           SELECT 2, turn_id, 'trajectory-turn', turn_id
             FROM trajectory_turns WHERE log_id = ? AND head = ?
         ) adjacency
         WHERE edge_group > ?
            OR (edge_group = ? AND (? IS NULL OR sort_key > ?))
         ORDER BY edge_group, sort_key, member_id LIMIT ?`,
        String(node["logId"]),
        String(node["head"]),
        String(node["logId"]),
        String(node["head"]),
        String(node["logId"]),
        String(node["head"]),
        after.phase,
        after.phase,
        after.key,
        after.key,
        limit,
      )
      .toArray() as Row[];
    return members.map((row) => ({
      position: {
        phase: Number(row["edge_group"]),
        key: String(row["sort_key"]),
      },
      edge: {
        kind: "part-of-trajectory",
        from:
          row["member_kind"] === "trajectory-invocation"
            ? {
                kind: "trajectory-invocation",
                logId: node["logId"],
                head: node["head"],
                invocationId: String(row["member_id"]),
              }
            : row["member_kind"] === "trajectory-message"
              ? {
                  kind: "trajectory-message",
                  logId: node["logId"],
                  head: node["head"],
                  messageId: String(row["member_id"]),
                }
              : {
                  kind: "trajectory-turn",
                  logId: node["logId"],
                  head: node["head"],
                  turnId: String(row["member_id"]),
                },
        to: trajectory,
      },
    }));
  }
  throw new SemanticVcsError("InvalidReference", "Unknown trajectory node kind");
}
