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
type WalkPage = { entries: Row[]; omitted: Row[]; notes: string[] };
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
  return cause ? walkTrajectoryInvocation(sql, cause, 0) : { entries: [], omitted: [], notes: [] };
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
  return { entries, omitted: [], notes };
}
