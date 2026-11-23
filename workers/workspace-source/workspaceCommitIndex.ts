import {
  canonicalJson,
  sha256HexSyncText,
} from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import type { StateNodeRef } from "@workspace/vcs-engine";

const capacity = 4_096;
const commitHash = /^[a-f0-9]{40}$/u;
const cells = new WeakMap<SqlStorage, Map<string, string>>();

export function createWorkspaceCommitIndex(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS commit_index (
    slot INTEGER PRIMARY KEY CHECK (slot >= 0 AND slot < ${capacity}),
    tip TEXT NOT NULL,
    state_kind TEXT NOT NULL,
    state_id TEXT NOT NULL,
    origin TEXT NOT NULL
  )`);
}

export function enableWorkspaceCommitIndex(sql: SqlStorage): void {
  if (!cells.has(sql)) cells.set(sql, new Map());
}

/** A stable state ID may have more than one origin across different histories. */
export function indexedWorkspaceCommit(
  sql: SqlStorage,
  tip: string,
  state: StateNodeRef,
  resolve: () => string | null,
): string | null {
  const cache = cells.get(sql);
  if (!cache || !commitHash.test(tip)) return resolve();
  const stateId = state.kind === "event" ? state.eventId : state.applicationId;
  if (stateId.length > 256) return resolve();
  const key = canonicalJson([tip, state.kind, stateId]);
  const remembered = cache.get(key);
  if (remembered !== undefined) return remembered;

  // A fixed number of slots bounds disk usage, including across restarts.
  const slot = parseInt(sha256HexSyncText(key).slice(0, 8), 16) % capacity;
  const stored = sql
    .exec(
      `SELECT origin FROM commit_index
      WHERE slot = ? AND tip = ? AND state_kind = ? AND state_id = ?`,
      slot,
      tip,
      state.kind,
      stateId,
    )
    .toArray()[0]?.["origin"];
  if (
    stored !== undefined &&
    (typeof stored !== "string" || !commitHash.test(stored))
  ) {
    throw new Error("Workspace commit index contains an invalid revision");
  }

  const origin = typeof stored === "string" ? stored : resolve();
  if (origin === null) return null;
  // Current states are cheap to resolve. Persist the ancestry lookups.
  if (stored === undefined && origin !== tip) {
    if (!commitHash.test(origin))
      throw new Error("Workspace state has an invalid origin revision");
    sql.exec(
      `INSERT OR REPLACE INTO commit_index (slot, tip, state_kind, state_id, origin)
        VALUES (?, ?, ?, ?, ?)`,
      slot,
      tip,
      state.kind,
      stateId,
      origin,
    );
  }
  if (cache.size >= capacity) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, origin);
  return origin;
}
