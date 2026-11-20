import type { SqlStorage } from "@vibestudio/durable";
import type {
  PutUserNotificationInput,
  UserNotification,
  UserNotificationListResult,
} from "@vibestudio/shared/userNotifications";

export function requireNotificationAccountId(
  value: unknown,
  method: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.startsWith("user:")
  ) {
    throw new Error(`${method}: userId must be a bare workspace account id`);
  }
  return value.trim();
}

/** Account-scoped retained rows. The caller owns authorization and live signals. */
export class UserNotificationStore {
  constructor(private readonly sql: SqlStorage) {}

  initialize(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS user_notifications (
        user_id         TEXT NOT NULL,
        notification_id TEXT NOT NULL,
        kind            TEXT NOT NULL,
        title           TEXT NOT NULL,
        message         TEXT,
        data_json       TEXT,
        created_at      INTEGER NOT NULL,
        producer_revision INTEGER NOT NULL,
        acknowledged_at INTEGER,
        PRIMARY KEY (user_id, notification_id)
      )
    `);
    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
        ON user_notifications (user_id, acknowledged_at, created_at DESC, notification_id)
    `);
  }

  requireText(value: unknown, field: string, method: string): string {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`${method}: ${field} is required`);
    }
    const text = value.trim();
    const max =
      field === "id"
        ? 512
        : field === "kind"
          ? 128
          : field === "title"
            ? 256
            : 4096;
    if (text.length > max)
      throw new Error(`${method}: ${field} exceeds ${max} characters`);
    return text;
  }

  fromRow(row: Record<string, unknown>): UserNotification {
    const dataJson = row["data_json"];
    let data: unknown;
    if (typeof dataJson === "string") {
      try {
        data = JSON.parse(dataJson);
      } catch {
        throw new Error(
          `Corrupt user notification ${String(row["notification_id"])}: invalid data_json`,
        );
      }
    }
    return {
      id: String(row["notification_id"]),
      userId: String(row["user_id"]),
      kind: String(row["kind"]),
      title: String(row["title"]),
      ...(typeof row["message"] === "string"
        ? { message: row["message"] }
        : {}),
      ...(data !== undefined ? { data } : {}),
      createdAt: Number(row["created_at"]),
      revision: Number(row["producer_revision"]),
    };
  }

  put(input: PutUserNotificationInput, method: string): UserNotification {
    const userId = requireNotificationAccountId(input?.userId, method);
    const id = this.requireText(input?.id, "id", method);
    const kind = this.requireText(input?.kind, "kind", method);
    const title = this.requireText(input?.title, "title", method);
    const message =
      typeof input.message === "string" && input.message.trim()
        ? this.requireText(input.message, "message", method)
        : null;
    if (!Number.isSafeInteger(input.createdAt) || input.createdAt < 0) {
      throw new Error(
        `${method}: createdAt must be a non-negative safe integer`,
      );
    }
    if (!Number.isSafeInteger(input.revision) || input.revision <= 0) {
      throw new Error(`${method}: revision must be a positive safe integer`);
    }
    let dataJson: string | null = null;
    if (input.data !== undefined) {
      let encoded: string | undefined;
      try {
        encoded = JSON.stringify(input.data);
      } catch {
        throw new Error(`${method}: data must be JSON-serializable`);
      }
      if (encoded === undefined)
        throw new Error(`${method}: data must be JSON-serializable`);
      if (new TextEncoder().encode(encoded).byteLength > 64 * 1024) {
        throw new Error(`${method}: data exceeds 65536 serialized bytes`);
      }
      dataJson = encoded;
    }
    const existingRow = this.sql
      .exec(
        `SELECT user_id, notification_id, kind, title, message, data_json, created_at, producer_revision
           FROM user_notifications WHERE user_id = ? AND notification_id = ?`,
        userId,
        id,
      )
      .toArray()[0];
    if (existingRow) {
      const existing = this.fromRow(existingRow);
      if (input.revision < existing.revision) return existing;
      if (input.revision === existing.revision) {
        const identical =
          existing.kind === kind &&
          existing.title === title &&
          (existing.message ?? null) === message &&
          (typeof existingRow["data_json"] === "string"
            ? existingRow["data_json"]
            : null) === dataJson &&
          existing.createdAt === input.createdAt;
        if (!identical) {
          throw new Error(
            `${method}: revision ${input.revision} was already used for other data`,
          );
        }
        return existing;
      }
    }
    this.sql.exec(
      `INSERT INTO user_notifications
         (user_id, notification_id, kind, title, message, data_json, created_at, producer_revision, acknowledged_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(user_id, notification_id) DO UPDATE SET
         kind = excluded.kind,
         title = excluded.title,
         message = excluded.message,
         data_json = excluded.data_json,
         created_at = excluded.created_at,
         producer_revision = excluded.producer_revision,
         acknowledged_at = CASE
           WHEN excluded.producer_revision > user_notifications.producer_revision THEN NULL
           ELSE user_notifications.acknowledged_at
         END
       WHERE excluded.producer_revision >= user_notifications.producer_revision`,
      userId,
      id,
      kind,
      title,
      message,
      dataJson,
      input.createdAt,
      input.revision,
    );
    const row = this.sql
      .exec(
        `SELECT user_id, notification_id, kind, title, message, data_json, created_at, producer_revision
           FROM user_notifications WHERE user_id = ? AND notification_id = ?`,
        userId,
        id,
      )
      .toArray()[0];
    if (!row)
      throw new Error(`${method}: notification upsert did not produce a row`);
    return this.fromRow(row);
  }

  remove(userId: string, id: string): boolean {
    const deleted =
      this.sql
        .exec(
          `SELECT 1 FROM user_notifications WHERE user_id = ? AND notification_id = ?`,
          userId,
          id,
        )
        .toArray().length > 0;
    if (deleted) {
      this.sql.exec(
        `DELETE FROM user_notifications WHERE user_id = ? AND notification_id = ?`,
        userId,
        id,
      );
    }
    return deleted;
  }

  list(
    userId: string,
    input?: {
      includeAcknowledged?: boolean;
      limit?: number;
    },
  ): UserNotificationListResult {
    const includeAcknowledged = input?.includeAcknowledged === true;
    const limit =
      typeof input?.limit === "number" &&
      Number.isInteger(input.limit) &&
      input.limit > 0
        ? Math.min(input.limit, 500)
        : null;
    // The inbox is the durable record (messaging plan §4.10.8): the default view
    // is what still wants attention; history is opt-in and bounded.
    const rows = this.sql
      .exec(
        `SELECT inbox.user_id, inbox.notification_id, inbox.kind, inbox.title, inbox.message,
                inbox.data_json, inbox.created_at, inbox.producer_revision, inbox.acknowledged_at
           FROM user_notifications AS inbox
          WHERE inbox.user_id = ?${includeAcknowledged ? "" : " AND inbox.acknowledged_at IS NULL"}
            AND NOT (
              inbox.kind = 'channel.invite'
              AND EXISTS (
                SELECT 1
                  FROM user_notifications AS message
                 WHERE message.user_id = inbox.user_id
                   AND message.kind = 'agent.message'
                   AND json_extract(message.data_json, '$.channelId') =
                       json_extract(inbox.data_json, '$.channelId')
              )
            )
          ORDER BY inbox.created_at DESC, inbox.notification_id ASC${limit ? ` LIMIT ${limit}` : ""}`,
        userId,
      )
      .toArray();
    return {
      notifications: rows.map((row) => {
        const notification = this.fromRow(row);
        const acknowledgedAt = row["acknowledged_at"];
        return typeof acknowledgedAt === "number"
          ? { ...notification, acknowledgedAt }
          : notification;
      }),
    };
  }
  acknowledge(userId: string, id: string, acknowledgedAt: number): boolean {
    const acknowledged =
      this.sql
        .exec(
          `SELECT 1 FROM user_notifications
            WHERE user_id = ? AND notification_id = ? AND acknowledged_at IS NULL`,
          userId,
          id,
        )
        .toArray().length > 0;
    if (acknowledged) {
      this.sql.exec(
        `UPDATE user_notifications SET acknowledged_at = ?
          WHERE user_id = ? AND notification_id = ? AND acknowledged_at IS NULL`,
        acknowledgedAt,
        userId,
        id,
      );
    }
    return acknowledged;
  }
}
