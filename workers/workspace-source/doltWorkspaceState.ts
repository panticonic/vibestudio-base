import { canonicalJson, compareUtf16CodeUnits } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import type { WorkspaceMaterializationRepository } from "@vibestudio/shared/vcs/workspaceProjection";
import { compactId, type StateNodeRef, type WorkspaceFactChangeSet } from "@workspace/vcs-engine";
import type { ApplicationRecord, WorkspaceEventRecord } from "./semanticVcsStore.js";
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
type PlacementChange = Pick<WorkspaceFactChangeSet, "repositoryUpdates" | "fileUpdates">;

/** Resolve a public state identity against one reachable history. */
export function workspaceCommitForRef(
  sql: SqlStorage,
  at: string,
  ref: StateNodeRef
): string | null {
  const event = ref.kind === "event";
  const table = event ? "events" : "applications";
  const key = event ? "event_id" : "application_id";
  const value = ref.kind === "event" ? ref.eventId : ref.applicationId;
  const origins = sql
    .exec(
      `WITH RECURSIVE containing(hash) AS (
       SELECT ?1 WHERE EXISTS (SELECT 1 FROM dolt_at_${table}(?1) WHERE ${key} = ?2)
       UNION
       SELECT parent.parent_hash FROM containing AS current
       JOIN dolt_commit_ancestors AS parent ON parent.commit_hash = current.hash
       WHERE parent.parent_hash IS NOT NULL AND EXISTS (
         SELECT 1 FROM dolt_at_${table}(parent.parent_hash) WHERE ${key} = ?2
       )
     )
     SELECT current.hash FROM containing AS current WHERE NOT EXISTS (
       SELECT 1 FROM dolt_commit_ancestors AS parent
       JOIN containing AS seen ON seen.hash = parent.parent_hash
       WHERE parent.commit_hash = current.hash
     ) LIMIT 2`,
      at,
      value
    )
    .toArray();
  if (origins.length > 1) throw new Error(`Workspace state ${value} has multiple origins`);
  const origin = origins[0]?.["hash"];
  if (origin === undefined) return null;
  if (typeof origin !== "string") throw new Error("Invalid workspace commit identity");
  return origin;
}

/** Project a committed revision into the host's existing materialization protocol. */
export function workspaceRepositoriesAt(
  sql: SqlStorage,
  commit: string
): WorkspaceMaterializationRepository[] {
  const repositories = new Map<
    string,
    {
      repoPath: string;
      files: Array<{ path: string; contentHash: string; mode: number }>;
    }
  >();
  for (const row of sql
    .exec(
      `SELECT repository_id, repo_path FROM dolt_at_repositories(?) WHERE presence = 'present'`,
      commit
    )
    .toArray()) {
    const { repository_id, repo_path } = row;
    if (typeof repository_id !== "string" || typeof repo_path !== "string") {
      throw new Error(`Invalid repository placement at ${commit}`);
    }
    repositories.set(repository_id, { repoPath: repo_path, files: [] });
  }
  for (const row of sql
    .exec(
      `SELECT repository_id, path, content_hash, mode FROM dolt_at_files(?) WHERE presence = 'placed'`,
      commit
    )
    .toArray()) {
    const { repository_id, path, content_hash, mode } = row;
    const entry = typeof repository_id === "string" ? repositories.get(repository_id) : undefined;
    if (
      !entry ||
      typeof path !== "string" ||
      typeof content_hash !== "string" ||
      typeof mode !== "number" ||
      !Number.isSafeInteger(mode) ||
      mode < 0
    ) {
      throw new Error(`Invalid file placement at ${commit}`);
    }
    entry.files.push({ path, contentHash: content_hash, mode });
  }
  return [...repositories]
    .map(([repositoryId, { repoPath, files }]) => {
      files.sort((left, right) => compareUtf16CodeUnits(left.path, right.path));
      return {
        repositoryId,
        repoPath,
        presence: "present" as const,
        fileManifestId: compactId("dolt-file-manifest", files),
        source: { kind: "snapshot" as const, files },
      };
    })
    .sort((left, right) => compareUtf16CodeUnits(left.repoPath, right.repoPath));
}

/** Rebuild the placement roots directly from the retained commit graph. */
export function workspacePlacementRoots(sql: SqlStorage, retained: readonly string[]): string[] {
  const rows = sql.exec(
    `SELECT DISTINCT files.content_hash
       FROM json_each(?) AS tips CROSS JOIN dolt_history_files(tips.value) AS files
      WHERE files.content_hash IS NOT NULL ORDER BY files.content_hash`,
    JSON.stringify([...new Set(retained)]),
  ).toArray();
  return rows.map((row) => {
    const hash = row["content_hash"];
    if (typeof hash !== "string" || !hash) throw new Error("Invalid workspace content identity");
    return hash;
  });
}

/** Locate the most recent committed event on a context's first-parent chain. */
export function committedWorkspaceEvent(
  sql: SqlStorage,
  head: string
): { head: string; eventId: string } | null {
  let cursor = head;
  for (;;) {
    const parents: string[] = sql
      .exec(
        `SELECT parent_hash FROM dolt_commit_ancestors
          WHERE commit_hash = ? AND parent_hash IS NOT NULL
          ORDER BY parent_index`,
        cursor
      )
      .toArray()
      .map((row) => String(row["parent_hash"]));
    const [first, second] = parents;
    if (!first) return null;
    if (parents.length > 2) throw new Error("A workspace event has too many parents");
    // A merge brings the second parent's existing event rows with it. Only
    // rows absent on both sides were introduced by the merge itself.
    const introduced = second
      ? sql
          .exec(
            `SELECT diff.to_event_id FROM dolt_diff_events(?, ?) AS diff
            WHERE diff.diff_type = 'added' AND NOT EXISTS (
              SELECT 1 FROM dolt_at_events(?) AS other
               WHERE other.event_id = diff.to_event_id
            ) LIMIT 2`,
            first,
            cursor,
            second
          )
          .toArray()
      : sql
          .exec(
            `SELECT to_event_id FROM dolt_diff_events(?, ?)
            WHERE diff_type = 'added' LIMIT 2`,
            first,
            cursor
          )
          .toArray();
    if (introduced.length > 1) throw new Error("A workspace commit introduced multiple events");
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

    CREATE TABLE IF NOT EXISTS applications (
      application_id TEXT NOT NULL PRIMARY KEY,
      work_unit_id TEXT NOT NULL,
      semantic_protocol TEXT NOT NULL
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

export function recordDoltWorkspaceApplication(
  sql: SqlStorage,
  application: Pick<ApplicationRecord, "applicationId" | "workUnitId" | "semanticProtocol">
): void {
  sql.exec(
    "INSERT INTO applications (application_id, work_unit_id, semantic_protocol) VALUES (?, ?, ?)",
    application.applicationId,
    application.workUnitId,
    application.semanticProtocol
  );
}

export function recordDoltWorkspaceEvent(
  sql: SqlStorage,
  event: Pick<
    WorkspaceEventRecord,
    "eventId" | "commandId" | "kind" | "message" | "createdAt" | "snapshotSource"
  >
): void {
  sql.exec(
    "INSERT INTO events (event_id, command_id, kind, message, created_at, snapshot_source) VALUES (?, ?, ?, ?, ?, ?)",
    event.eventId,
    event.commandId,
    event.kind,
    event.message,
    event.createdAt,
    event.snapshotSource === null ? null : JSON.stringify(event.snapshotSource)
  );
}

/** Apply a prepared semantic change inside the context's committed transaction. */
export function applyDoltWorkspaceState(sql: SqlStorage, change: PlacementChange): void {
  const expected = placementRows(change, "expected");
  assertWorkspaceRows(
    sql,
    "repositories",
    repositoryColumns,
    change.repositoryUpdates.map(({ repositoryId }) => repositoryId),
    expected.repositories
  );
  assertWorkspaceRows(
    sql,
    "files",
    fileColumns,
    change.fileUpdates.map(({ fileId }) => fileId),
    expected.files
  );
  // Remove every changed placement before installing the new ones. A single
  // change can exchange two paths and both final placements are valid.
  if (change.repositoryUpdates.length) {
    sql.exec(
      "DELETE FROM repositories WHERE repository_id IN (SELECT value FROM json_each(?))",
      JSON.stringify(change.repositoryUpdates.map(({ repositoryId }) => repositoryId))
    );
  }
  if (change.fileUpdates.length) {
    sql.exec(
      "DELETE FROM files WHERE file_id IN (SELECT value FROM json_each(?))",
      JSON.stringify(change.fileUpdates.map(({ fileId }) => fileId))
    );
  }
  const { repositories, files } = placementRows(change);
  execBatchedInsert(
    sql,
    `INSERT INTO repositories (${repositoryColumns.join(", ")})`,
    repositoryColumns.length,
    repositories
  );
  execBatchedInsert(
    sql,
    `INSERT INTO files (${fileColumns.join(", ")})`,
    fileColumns.length,
    files
  );
}

function assertWorkspaceRows(
  sql: SqlStorage,
  table: "files" | "repositories",
  columns: readonly string[],
  ids: readonly string[],
  expected: readonly (readonly unknown[])[]
): void {
  if (ids.length === 0) return;
  const rows = sql
    .exec(
      `SELECT ${columns.join(", ")} FROM ${table} WHERE ${columns[0]} IN (SELECT value FROM json_each(?))`,
      JSON.stringify(ids)
    )
    .toArray();
  const byId = new Map(expected.map((row) => [row[0], canonicalJson(row)]));
  if (
    rows.length !== byId.size ||
    rows.some(
      (row) => byId.get(row[columns[0]!]) !== canonicalJson(columns.map((column) => row[column]))
    )
  ) {
    throw new Error(`Workspace ${table} changed before applying the prepared revision`);
  }
}

export function verifyDoltWorkspaceState(
  sql: SqlStorage,
  hash: string,
  expected: PlacementChange
): void {
  if (!/^[0-9a-z]+$/u.test(hash)) throw new Error("Invalid workspace commit hash");
  const { repositories, files } = placementRows(expected);
  verify("repositories", repositoryColumns, repositories);
  verify("files", fileColumns, files);

  function verify(
    table: "repositories" | "files",
    columns: readonly string[],
    rows: readonly (readonly unknown[])[]
  ) {
    const actual = sql
      .exec(`SELECT ${columns.join(", ")} FROM dolt_at_${table}('${hash}')`)
      .toArray()
      .map((row) => columns.map((column) => row[column]));
    const sort = (input: readonly (readonly unknown[])[]) =>
      [...input].sort((a, b) =>
        String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0
      );
    if (canonicalJson(sort(actual)) !== canonicalJson(sort(rows))) {
      throw new Error(`Workspace replay has different ${table} at ${hash}`);
    }
  }
}

function placementRows(change: PlacementChange, side: "result" | "expected" = "result") {
  return {
    repositories: change.repositoryUpdates
      .flatMap((row) => row[side] ?? [])
      .map((result) =>
        result.presence === "present"
          ? [result.repositoryId, result.repoPath, result.presence, null]
          : [result.repositoryId, null, result.presence, result.tombstoneChangeId]
      ),
    files: change.fileUpdates
      .flatMap((row) => row[side] ?? [])
      .map((result) =>
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
            ]
      ),
  };
}
