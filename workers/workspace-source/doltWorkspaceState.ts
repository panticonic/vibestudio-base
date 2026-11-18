import { canonicalJson } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import type { WorkspaceFactChangeSet } from "@workspace/vcs-engine";
import type { WorkspaceEventRecord } from "./semanticVcsStore.js";
import { createSemanticHistoryTables } from "./semanticHistorySchema.js";
import { execBatchedInsert } from "./sqlBatch.js";

const repositoryColumns = [
  "repository_id",
  "repo_path",
  "presence",
  "tombstone_change_id",
] as const;
const fileColumns = [
  "file_id",
  "repository_id",
  "path",
  "content_hash",
  "mode",
  "content_kind",
  "byte_length",
  "coordinate_extent",
  "presence",
  "tombstone_change_id",
] as const;
type PlacementChange = Pick<
  WorkspaceFactChangeSet,
  "repositoryUpdates" | "fileUpdates"
>;

/** Locate the most recent committed event on a context's first-parent chain. */
export function committedWorkspaceEvent(
  sql: SqlStorage,
  head: string,
): { head: string; eventId: string } | null {
  let cursor = head;
  for (;;) {
    const parents: string[] = sql
      .exec(
        `SELECT parent_hash FROM dolt_commit_ancestors
          WHERE commit_hash = ? AND parent_hash IS NOT NULL
          ORDER BY parent_index`,
        cursor,
      )
      .toArray()
      .map((row) => String(row["parent_hash"]));
    const [first, second] = parents;
    if (!first) return null;
    if (parents.length > 2)
      throw new Error("A workspace event has too many parents");
    // A merge brings the second parent's existing event rows with it. Only
    // rows absent on both sides were introduced by the merge itself.
    const introduced = second
      ? sql.exec(
          `SELECT diff.to_event_id FROM dolt_diff_events(?, ?) AS diff
            WHERE diff.diff_type = 'added' AND NOT EXISTS (
              SELECT 1 FROM dolt_at_events(?) AS other
               WHERE other.event_id = diff.to_event_id
            ) LIMIT 2`,
          first,
          cursor,
          second,
        ).toArray()
      : sql.exec(
          `SELECT to_event_id FROM dolt_diff_events(?, ?)
            WHERE diff_type = 'added' LIMIT 2`,
          first,
          cursor,
        ).toArray();
    if (introduced.length > 1)
      throw new Error("A workspace commit introduced multiple events");
    if (introduced.length === 1) {
      const eventId = introduced[0]?.["to_event_id"];
      if (typeof eventId !== "string" || !eventId)
        throw new Error("A workspace commit introduced an invalid event identity");
      return { head: cursor, eventId };
    }
    cursor = first;
  }
}

export function createDoltWorkspaceState(sql: SqlStorage): void {
  createSemanticHistoryTables(sql);
  sql.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      repository_id TEXT PRIMARY KEY,
      repo_path TEXT,
      presence TEXT NOT NULL CHECK (presence IN ('present', 'deleted')),
      tombstone_change_id TEXT,
      CHECK (
        (presence = 'present' AND repo_path IS NOT NULL AND tombstone_change_id IS NULL)
        OR (presence = 'deleted' AND repo_path IS NULL AND tombstone_change_id IS NOT NULL)
      )
    );
    CREATE UNIQUE INDEX IF NOT EXISTS repositories_path ON repositories(repo_path);

    CREATE TABLE IF NOT EXISTS files (
      file_id TEXT PRIMARY KEY,
      repository_id TEXT,
      path TEXT,
      content_hash TEXT,
      mode INTEGER,
      content_kind TEXT CHECK (content_kind IN ('text', 'bytes')),
      byte_length INTEGER CHECK (byte_length >= 0),
      coordinate_extent INTEGER CHECK (coordinate_extent >= 0),
      presence TEXT NOT NULL CHECK (presence IN ('placed', 'deleted')),
      tombstone_change_id TEXT,
      CHECK (
        (presence = 'placed' AND repository_id IS NOT NULL AND path IS NOT NULL
          AND content_hash IS NOT NULL AND mode IS NOT NULL AND content_kind IS NOT NULL
          AND byte_length IS NOT NULL AND coordinate_extent IS NOT NULL
          AND (content_kind = 'text' OR coordinate_extent = byte_length)
          AND tombstone_change_id IS NULL)
        OR (presence = 'deleted' AND repository_id IS NULL AND path IS NULL
          AND content_hash IS NULL AND mode IS NULL AND content_kind IS NULL
          AND byte_length IS NULL AND coordinate_extent IS NULL AND tombstone_change_id IS NOT NULL)
      )
    );
    CREATE UNIQUE INDEX IF NOT EXISTS files_placement ON files(repository_id, path);

    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,
      command_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('genesis', 'commit', 'integration-commit')),
      message TEXT,
      created_at TEXT NOT NULL,
      snapshot_source TEXT CHECK (snapshot_source IS NULL OR json_valid(snapshot_source) = 1)
    );

    CREATE TABLE IF NOT EXISTS commands (
      command_id TEXT PRIMARY KEY,
      scope_kind TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      method TEXT NOT NULL,
      request_digest TEXT NOT NULL,
      cause_log_id TEXT,
      cause_head TEXT,
      cause_invocation_id TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

export function recordDoltWorkspaceEvent(
  sql: SqlStorage,
  event: Pick<
    WorkspaceEventRecord,
    | "eventId"
    | "commandId"
    | "kind"
    | "message"
    | "createdAt"
    | "snapshotSource"
  >,
): void {
  sql.exec(
    "INSERT INTO events (event_id, command_id, kind, message, created_at, snapshot_source) VALUES (?, ?, ?, ?, ?, ?)",
    event.eventId,
    event.commandId,
    event.kind,
    event.message,
    event.createdAt,
    event.snapshotSource === null ? null : JSON.stringify(event.snapshotSource),
  );
}

/** Apply a prepared semantic change inside the context's committed transaction. */
export function applyDoltWorkspaceState(
  sql: SqlStorage,
  change: PlacementChange,
): void {
  // Remove every changed placement before installing the new ones. A single
  // change can exchange two paths and both final placements are valid.
  if (change.repositoryUpdates.length) {
    sql.exec(
      "DELETE FROM repositories WHERE repository_id IN (SELECT value FROM json_each(?))",
      JSON.stringify(
        change.repositoryUpdates.map(({ repositoryId }) => repositoryId),
      ),
    );
  }
  if (change.fileUpdates.length) {
    sql.exec(
      "DELETE FROM files WHERE file_id IN (SELECT value FROM json_each(?))",
      JSON.stringify(change.fileUpdates.map(({ fileId }) => fileId)),
    );
  }
  const { repositories, files } = placementRows(change);
  execBatchedInsert(
    sql,
    `INSERT INTO repositories (${repositoryColumns.join(", ")})`,
    repositoryColumns.length,
    repositories,
  );
  execBatchedInsert(
    sql,
    `INSERT INTO files (${fileColumns.join(", ")})`,
    fileColumns.length,
    files,
  );
}

export function verifyDoltWorkspaceState(
  sql: SqlStorage,
  hash: string,
  expected: PlacementChange,
): void {
  if (!/^[0-9a-z]+$/u.test(hash))
    throw new Error("Invalid workspace commit hash");
  const { repositories, files } = placementRows(expected);
  verify("repositories", repositoryColumns, repositories);
  verify("files", fileColumns, files);

  function verify(
    table: "repositories" | "files",
    columns: readonly string[],
    rows: readonly (readonly unknown[])[],
  ) {
    const actual = sql
      .exec(`SELECT ${columns.join(", ")} FROM dolt_at_${table}('${hash}')`)
      .toArray()
      .map((row) => columns.map((column) => row[column]));
    const sort = (input: readonly (readonly unknown[])[]) =>
      [...input].sort((a, b) =>
        String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0,
      );
    if (canonicalJson(sort(actual)) !== canonicalJson(sort(rows))) {
      throw new Error(`Workspace replay has different ${table} at ${hash}`);
    }
  }
}

function placementRows(change: PlacementChange) {
  return {
    repositories: change.repositoryUpdates.map(({ result }) =>
      result.presence === "present"
        ? [result.repositoryId, result.repoPath, result.presence, null]
        : [
            result.repositoryId,
            null,
            result.presence,
            result.tombstoneChangeId,
          ],
    ),
    files: change.fileUpdates.map(({ result }) =>
      result.presence === "placed"
        ? [
            result.fileId,
            result.repositoryId,
            result.path,
            result.contentHash,
            result.mode,
            result.contentKind,
            result.byteLength,
            result.coordinateExtent,
            result.presence,
            null,
          ]
        : [
            result.fileId,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            result.presence,
            result.tombstoneChangeId,
          ],
    ),
  };
}
