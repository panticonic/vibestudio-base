/**
 * FeedbackIngest — durable intake for `ui.feedback` events targeting this
 * agent (render failures, invalid card state, expired method calls, …).
 *
 * Design constraints:
 * - **Deduped**: render errors fire per-mount; `occurrenceKey` collapses
 *   repeats (with a TTL so a recurring failure resurfaces eventually).
 * - **Never mints a turn**: feedback is queued and prepended to the agent's
 *   next turn input as a diagnostic note — a feedback storm can never spin
 *   the agent by itself. If a turn is already running, the vessel may steer
 *   the note into it instead.
 */

import type { SqlStorage } from "@workspace/runtime/worker";
import type { UiFeedbackPayload } from "@workspace/agentic-protocol";

const DEDUPE_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_PER_CHANNEL = 20;

export class FeedbackIngest {
  constructor(
    private readonly sql: SqlStorage,
    private readonly now: () => number = () => Date.now()
  ) {}

  static createTables(sql: SqlStorage): void {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS feedback_seen (
        occurrence_key TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      )
    `);
    sql.exec(`
      CREATE TABLE IF NOT EXISTS pending_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        note TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
  }

  /** Record a feedback payload for the agent's next turn, unless deduplicated. */
  ingest(channelId: string, payload: UiFeedbackPayload): void {
    const ts = this.now();
    this.sql.exec(`DELETE FROM feedback_seen WHERE created_at < ?`, ts - DEDUPE_TTL_MS);
    const seen = this.sql
      .exec(`SELECT 1 FROM feedback_seen WHERE occurrence_key = ?`, payload.occurrenceKey)
      .toArray();
    if (seen.length > 0) return;
    this.sql.exec(
      `INSERT OR REPLACE INTO feedback_seen (occurrence_key, created_at) VALUES (?, ?)`,
      payload.occurrenceKey,
      ts
    );
    this.enqueue(channelId, formatFeedbackNote(payload));
  }

  /** Queue a note for the next turn on this channel (bounded). */
  private enqueue(channelId: string, note: string): void {
    this.sql.exec(
      `INSERT INTO pending_feedback (channel_id, note, created_at) VALUES (?, ?, ?)`,
      channelId,
      note,
      this.now()
    );
    // Bound the queue: keep only the newest entries.
    this.sql.exec(
      `DELETE FROM pending_feedback
       WHERE channel_id = ? AND id NOT IN (
         SELECT id FROM pending_feedback WHERE channel_id = ?
         ORDER BY id DESC LIMIT ?
       )`,
      channelId,
      channelId,
      MAX_PENDING_PER_CHANNEL
    );
  }

  /** Drain queued notes for a channel (consumed into the next turn input). */
  consume(channelId: string): string[] {
    const rows = this.sql
      .exec(`SELECT id, note FROM pending_feedback WHERE channel_id = ? ORDER BY id ASC`, channelId)
      .toArray();
    if (rows.length === 0) return [];
    this.sql.exec(`DELETE FROM pending_feedback WHERE channel_id = ?`, channelId);
    return rows.map((row) => String(row["note"]));
  }
}

export function formatFeedbackNote(payload: UiFeedbackPayload): string {
  const refs = payload.refs ?? {};
  const where = [
    refs.typeId ? `type ${refs.typeId}` : null,
    refs.inlineUiId ? `inline UI ${refs.inlineUiId}` : null,
    refs.actionBarId ? `action bar ${refs.actionBarId}` : null,
    refs.messageId && !refs.inlineUiId && !refs.actionBarId
      ? `${refs.typeId ? "card" : "message"} ${refs.messageId}`
      : null,
    refs.callId ? `call ${refs.callId}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  if (payload.category === "props_invalid") {
    const subject = refs.inlineUiId
      ? `inline UI ${refs.inlineUiId}`
      : refs.actionBarId
        ? `action bar ${refs.actionBarId}`
        : `message ${refs.messageId ?? "(unknown)"}`;
    const component = refs.component ?? "A component";
    const remedy = refs.inlineUiId
      ? `Fix the props and call inline_ui again with the same id "${refs.inlineUiId}"; the user sees a notice instead of the component.`
      : refs.actionBarId
        ? "Fix the props and call load_action_bar again; the user sees a notice instead of the component."
        : "The user sees a notice instead of the component. Re-send the message with corrected props.";
    return [
      `[ui-feedback] ${component} in ${subject} rejected props: ${payload.error.message}`,
      remedy,
    ].join("\n");
  }
  const category =
    payload.category === "render_failed"
      ? "A UI component you published failed to render"
      : payload.category === "compile_failed"
        ? "UI source you authored failed to compile"
        : payload.category === "state_invalid"
          ? "A card you published has state that fails its registered schema"
          : payload.category === "type_not_registered"
            ? "A card you published references an unregistered message type"
            : payload.category === "method_call_failed"
              ? "A method call you were handling failed or expired"
              : payload.category === "load_stalled"
                ? "A card you published is stuck loading in the panel (its renderer never compiled)"
                : "A suspended wait timed out";
  const remedy = refs.inlineUiId
    ? `Fix the source and call inline_ui again with the same id "${refs.inlineUiId}" to replace the broken component; do not ignore this.`
    : refs.actionBarId
      ? "Fix the source and call load_action_bar again to replace the broken component; do not ignore this."
    : refs.messageId && !refs.typeId
      ? "The user sees your message as plain markdown/text instead. Re-send it with valid MDX (or drop the JSX components); do not ignore this."
      : "Fix the underlying problem or tell the user what went wrong; do not ignore this.";
  return [
    `[ui-feedback] ${category}${where ? ` (${where})` : ""}.`,
    `Error: ${payload.error.message}`,
    remedy,
  ].join("\n");
}

/**
 * Model input of a feedback repair: a UI notice from the chat panel about the
 * agent's own visibly failing output. It is not a user message and is never
 * published to the channel as one.
 */
export function formatFeedbackRepairInput(notes: readonly string[]): string {
  return [
    "[ui-feedback] Automatic notice from the chat panel, not a message from the user: UI you published is failing where the user can see it. Repair it now, or briefly tell the user what went wrong. Failures of what you publish while repairing are not reported until the next turn.",
    ...notes,
  ].join("\n\n");
}
