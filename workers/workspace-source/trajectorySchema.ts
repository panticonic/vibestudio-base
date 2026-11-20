import type { SqlStorage } from "@vibestudio/durable";

/** Projected transcript rows and their exact originating input coordinates. */
export function createTrajectoryMirrorSchema(sql: SqlStorage): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS trajectory_turns (
      log_id TEXT NOT NULL,
      head TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      opened_at TEXT,
      closed_at TEXT,
      summary TEXT,
      -- §6.3 turn-decay basis: the turn's per-branch ordinal (count of prior
      -- turns on this (log_id, head) at turn.opened). Wall-clock is display-only.
      ordinal INTEGER,
      -- Exact private trajectory message that triggered this turn. Actor and
      -- intent are derived by walking to that message; they are never copied
      -- onto the turn as an authorship snapshot. Nullable for non-message
      -- turns such as scheduled or heartbeat work.
      trigger_message_id TEXT,
      PRIMARY KEY (log_id, head, turn_id)
    )
  `);
  sql.exec(
    `CREATE INDEX IF NOT EXISTS idx_trajectory_turns_trigger_message
     ON trajectory_turns(log_id, head, trigger_message_id)`,
  );
  sql.exec(`
    CREATE TABLE IF NOT EXISTS trajectory_messages (
      log_id TEXT NOT NULL,
      head TEXT NOT NULL,
      message_id TEXT NOT NULL,
      turn_id TEXT,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      started_event_id TEXT,
      completed_event_id TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (log_id, head, message_id)
    )
  `);
  sql.exec(
    `CREATE INDEX IF NOT EXISTS idx_trajectory_messages_turn
     ON trajectory_messages(log_id, head, turn_id, message_id)`,
  );
  sql.exec(
    `CREATE INDEX IF NOT EXISTS idx_trajectory_messages_started
     ON trajectory_messages(started_event_id, log_id, head, message_id)`,
  );
  sql.exec(
    `CREATE INDEX IF NOT EXISTS idx_trajectory_messages_completed
     ON trajectory_messages(completed_event_id, log_id, head, message_id)`,
  );
  sql.exec(`
    CREATE TABLE IF NOT EXISTS trajectory_message_blocks (
      log_id TEXT NOT NULL,
      head TEXT NOT NULL,
      block_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      block_index INTEGER NOT NULL,
      block_type TEXT NOT NULL,
      invocation_id TEXT,
      PRIMARY KEY (log_id, head, block_id)
    )
  `);
  sql.exec(
    `CREATE INDEX IF NOT EXISTS idx_trajectory_message_blocks_message
     ON trajectory_message_blocks(log_id, head, message_id, block_index, block_id)`,
  );
  sql.exec(
    `CREATE INDEX IF NOT EXISTS idx_trajectory_message_blocks_invocation
     ON trajectory_message_blocks(invocation_id, log_id, head, message_id)`,
  );
  sql.exec(`
    CREATE TABLE IF NOT EXISTS trajectory_invocations (
      log_id TEXT NOT NULL,
      head TEXT NOT NULL,
      invocation_id TEXT NOT NULL,
      turn_id TEXT,
      transport_call_id TEXT,
      kind TEXT,
      status TEXT NOT NULL,
      terminal_outcome TEXT,
      terminal_reason_code TEXT,
      request_ref_json TEXT,
      result_ref_json TEXT,
      started_event_id TEXT,
      completed_event_id TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (log_id, head, invocation_id)
    )
  `);
  sql.exec(
    `CREATE INDEX IF NOT EXISTS idx_trajectory_invocations_transport ON trajectory_invocations(transport_call_id)`,
  );
  // Invocation→turn traversal is shared by semantic provenance inspectors.
  sql.exec(
    `CREATE INDEX IF NOT EXISTS idx_trajectory_invocations_scoped_turn
     ON trajectory_invocations(log_id, head, turn_id, invocation_id)`,
  );
  sql.exec(
    `CREATE INDEX IF NOT EXISTS idx_trajectory_invocations_identity
     ON trajectory_invocations(invocation_id, log_id, head)`,
  );
  sql.exec(`
    CREATE VIEW IF NOT EXISTS trajectory_invocation_inputs AS
      SELECT invocation.log_id, invocation.head, invocation.invocation_id,
             json_extract(event.payload_ref_json, '$.originatingInput.channelRef.objectKey') AS input_log_id,
             'main' AS input_head,
             json_extract(event.payload_ref_json, '$.originatingInput.messageId') AS input_message_id
        FROM trajectory_invocations invocation
        JOIN log_events event
          ON event.log_id = invocation.log_id AND event.head = invocation.head
         AND event.envelope_id = invocation.started_event_id
       WHERE json_type(event.payload_ref_json, '$.nativeSource') = 'object'
         AND json_type(event.payload_ref_json, '$.originatingInput') = 'object';
  `);
}
