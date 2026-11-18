import type { SqlStorage } from "@vibestudio/durable";
import type { WorkspaceFactChangeSet } from "@workspace/vcs-engine";
import { execBatchedInsert } from "./sqlBatch.js";

export function createDoltWorkspaceState(sql: SqlStorage): void {
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
  `);
}

/** Apply a prepared semantic change inside the context's committed transaction. */
export function applyDoltWorkspaceState(
  sql: SqlStorage,
  change: Pick<WorkspaceFactChangeSet, "repositoryUpdates" | "fileUpdates">,
): void {
  // Remove every changed placement before installing the new ones. A single
  // change can exchange two paths and both final placements are valid.
  if (change.repositoryUpdates.length) {
    sql.exec(
      "DELETE FROM repositories WHERE repository_id IN (SELECT value FROM json_each(?))",
      JSON.stringify(change.repositoryUpdates.map(({ repositoryId }) => repositoryId)),
    );
  }
  if (change.fileUpdates.length) {
    sql.exec(
      "DELETE FROM files WHERE file_id IN (SELECT value FROM json_each(?))",
      JSON.stringify(change.fileUpdates.map(({ fileId }) => fileId)),
    );
  }
  execBatchedInsert(
    sql,
    "INSERT INTO repositories (repository_id, repo_path, presence, tombstone_change_id)",
    4,
    change.repositoryUpdates.map(({ result }) =>
      result.presence === "present"
        ? [result.repositoryId, result.repoPath, result.presence, null]
        : [result.repositoryId, null, result.presence, result.tombstoneChangeId],
    ),
  );
  execBatchedInsert(
    sql,
    `INSERT INTO files
      (file_id, repository_id, path, content_hash, mode, content_kind,
       byte_length, coordinate_extent, presence, tombstone_change_id)`,
    10,
    change.fileUpdates.map(({ result }) =>
      result.presence === "placed"
        ? [
            result.fileId, result.repositoryId, result.path, result.contentHash,
            result.mode, result.contentKind, result.byteLength, result.coordinateExtent,
            result.presence, null,
          ]
        : [result.fileId, null, null, null, null, null, null, null, result.presence, result.tombstoneChangeId],
    ),
  );
}
