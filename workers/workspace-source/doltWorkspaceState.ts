import { canonicalJson, compareUtf16CodeUnits } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import type { WorkspaceMaterializationRepository } from "@vibestudio/shared/vcs/workspaceProjection";
import {
  compactId,
  workspaceFileStateIdentity,
  workspaceRepositoryStateIdentity,
  type StateNodeRef,
  type WorkspaceFactChangeSet,
} from "@workspace/vcs-engine";
import type {
  ApplicationRecord,
  IntegrationDecisionRecord,
  WorkspaceEventRecord,
} from "./semanticVcsStore.js";
import { createSemanticHistoryTables } from "./semanticHistorySchema.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";
import {
  SemanticWorkspace,
  type FileContentOrigin,
  type FileTransition,
  type RepositoryTransition,
  type WorkspaceEditBasis,
} from "./semanticWorkspace.js";
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
export type WorkspacePlacementChange = Pick<
  WorkspaceFactChangeSet,
  "repositoryUpdates" | "fileUpdates"
>;

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

/** Read the edit planner's placement coordinates without checking out a branch. */
export function workspaceEditBasisAt(sql: SqlStorage, commit: string): WorkspaceEditBasis {
  const repository = (column: "repository_id" | "repo_path", value: string) => {
    const row = sql.exec(
      `SELECT repository_id, repo_path FROM dolt_at_repositories(?)
        WHERE ${column} = ? AND presence = 'present'`,
      commit,
      value,
    ).toArray()[0];
    if (!row) return null;
    if (typeof row["repository_id"] !== "string" || typeof row["repo_path"] !== "string") {
      throw new Error(`Invalid repository placement at ${commit}`);
    }
    return { repositoryId: row["repository_id"], repoPath: row["repo_path"] };
  };
  const hasFile = (
    condition: "repository_id = ?" | "repository_id = ? AND path = ?",
    ...bindings: string[]
  ) =>
    sql.exec(
      `SELECT 1 FROM dolt_at_files(?)
        WHERE presence = 'placed' AND ${condition} LIMIT 1`,
      commit,
      ...bindings,
    ).toArray().length > 0;
  return {
    file(fileId) {
      const row = sql.exec(
        `SELECT repository_id, path, content_hash, mode, content_kind, byte_length, coordinate_extent
           FROM dolt_at_files(?) WHERE file_id = ? AND presence = 'placed'`,
        commit,
        fileId,
      ).toArray()[0];
      if (!row) return null;
      const {
        repository_id, path, content_hash, mode, content_kind, byte_length, coordinate_extent,
      } = row;
      if (
        typeof repository_id !== "string" ||
        typeof path !== "string" ||
        typeof content_hash !== "string" ||
        typeof mode !== "number" ||
        (content_kind !== "text" && content_kind !== "bytes") ||
        typeof byte_length !== "number" ||
        typeof coordinate_extent !== "number"
      ) {
        throw new Error(`Invalid file placement at ${commit}`);
      }
      const file = workspaceFileStateIdentity({
        fileId,
        presence: "placed",
        repositoryId: repository_id,
        path,
        contentHash: content_hash,
        mode,
        contentKind: content_kind,
        byteLength: byte_length,
        coordinateExtent: coordinate_extent,
      });
      if (file.presence !== "placed") throw new Error(`Invalid placed file identity at ${commit}`);
      return file;
    },
    repository: (id) => repository("repository_id", id),
    repositoryAtPath: (path) => repository("repo_path", path),
    emptyRepository(placement) {
      if (hasFile("repository_id = ?", placement.repositoryId)) return null;
      const state = workspaceRepositoryStateIdentity({
        ...placement,
        presence: "present",
        fileManifestId: compactId("dolt-file-manifest", []),
      });
      if (state.presence !== "present")
        throw new Error(`Invalid present repository identity at ${commit}`);
      return state;
    },
    hasFileAtPath: (id, path) => hasFile("repository_id = ? AND path = ?", id, path),
  };
}

/** Turn authored transitions into the exact rows the participant transaction compares and writes. */
export function prepareDoltEditPlacement(
  commit: string,
  files: readonly FileTransition[],
  repositories: readonly RepositoryTransition[],
) {
  const repositoryUpdates: Array<WorkspacePlacementChange["repositoryUpdates"][number]> = [];
  for (const { repositoryId, resultPath, expected, tombstoneChangeId } of repositories) {
    if (resultPath === undefined) continue;
    if (resultPath === null) {
      if (!expected || !tombstoneChangeId) {
        throw new Error("A deleted repository requires its prior placement and authored change");
      }
      repositoryUpdates.push({
        repositoryId,
        expected,
        result: workspaceRepositoryStateIdentity({
          repositoryId,
          presence: "deleted",
          priorRepositoryStateId: expected.repositoryStateId,
          tombstoneChangeId,
        }),
      });
      continue;
    }
    const entries = files.flatMap(({ result }) =>
      result.presence === "placed" && result.repositoryId === repositoryId
        ? [{ path: result.path, contentHash: result.contentHash, mode: result.mode }]
        : [],
    );
    entries.sort((left, right) => compareUtf16CodeUnits(left.path, right.path));
    repositoryUpdates.push({
      repositoryId,
      expected,
      result: workspaceRepositoryStateIdentity({
        repositoryId,
        presence: "present",
        repoPath: resultPath,
        fileManifestId: compactId("dolt-file-manifest", entries),
      }),
    });
  }
  const fileUpdates = files.map(({ fileId, expected, result }) => ({ fileId, expected, result }));
  const placement = repositoryUpdates.length || fileUpdates.length
    ? { repositoryUpdates, fileUpdates }
    : null;
  return {
    placement,
    resultRoot: placement ? compactId("dolt-workspace-transition", { commit, placement }) : commit,
    workspacePlanCompletedAt: Date.now(),
  };
}

const firstParents = `WITH RECURSIVE lineage(hash, parent, depth) AS (
       SELECT commit_hash, parent_hash, 0 FROM dolt_commit_ancestors
        WHERE commit_hash = ?1 AND parent_index = 0 AND parent_hash IS NOT NULL
          AND (?2 IS NULL OR commit_hash <> ?2)
       UNION ALL
       SELECT parent.commit_hash, parent.parent_hash, child.depth + 1
         FROM lineage AS child JOIN dolt_commit_ancestors AS parent
           ON parent.commit_hash = child.parent
        WHERE parent.parent_index = 0 AND parent.parent_hash IS NOT NULL
          AND (?2 IS NULL OR parent.commit_hash <> ?2)
     )`;

/** List applications introduced on the first-parent lineage, oldest first. */
export function workspaceApplicationsAt(
  sql: SqlStorage,
  commit: string,
  after: string | null = null,
): string[] {
  const rows = sql.exec(
    `${firstParents}
     SELECT diff.to_application_id AS application_id, lineage.depth
       FROM lineage CROSS JOIN dolt_diff_applications(lineage.parent, lineage.hash) AS diff
      WHERE diff.diff_type = 'added' AND NOT EXISTS (
        SELECT 1 FROM dolt_commit_ancestors AS parent
         CROSS JOIN dolt_at_applications(parent.parent_hash) AS inherited
         WHERE parent.commit_hash = lineage.hash AND parent.parent_index > 0
           AND inherited.application_id = diff.to_application_id
      ) ORDER BY lineage.depth DESC`,
    commit,
    after,
  ).toArray();
  const depths = new Set<number>();
  return rows.map((row) => {
    const { application_id, depth } = row;
    if (typeof application_id !== "string" || typeof depth !== "number" || depths.has(depth)) {
      throw new Error(`Invalid application lineage at ${commit}`);
    }
    depths.add(depth);
    return application_id;
  });
}

/** Verify that every reported integration names the saved revision on its second parent. */
export function workspaceMergeSourcesAt(
  sql: SqlStorage,
  commit: string,
  after: string,
  applications: readonly string[],
): string[] {
  const parents = sql.exec(
    `${firstParents}
     SELECT lineage.hash, lineage.parent AS ours, parent.parent_hash AS theirs, parent.parent_index
       FROM lineage JOIN dolt_commit_ancestors AS parent
         ON parent.commit_hash = lineage.hash AND parent.parent_index > 0
      ORDER BY lineage.depth DESC`,
    commit,
    after,
  ).toArray();
  const decisions = sql.exec(
    `SELECT app.application_id, decision.source_event_id, decision.source_delta_id,
            decision.target_state_kind, decision.target_state_id
       FROM dolt_at_applications(?1) AS app
       JOIN json_each(?2) AS selected ON selected.value = app.application_id
       JOIN dolt_at_gad_work_units(?1) AS work USING (work_unit_id)
       LEFT JOIN dolt_at_gad_integration_decisions(?1) AS decision USING (work_unit_id)
      WHERE work.kind = 'merge'`,
    commit,
    JSON.stringify(applications),
  ).toArray();
  const byApplication = new Map(decisions.map((row) => [row["application_id"], row]));
  const sources = new Set<string>();
  const incomplete = () => new SemanticVcsError(
    "IntegrationIncomplete",
    "Workspace integration has no decision for its exact native parents",
  );
  for (const { hash, ours, theirs, parent_index } of parents) {
    if (typeof hash !== "string" || typeof ours !== "string" || typeof theirs !== "string" ||
        parent_index !== 1) throw incomplete();
    const introduced = workspaceApplicationsAt(sql, hash, ours);
    const decision = byApplication.get(introduced[0]);
    if (introduced.length !== 1 || !decision || decision["source_delta_id"] !== null) {
      throw incomplete();
    }
    const source = decision["source_event_id"];
    const target = decision["target_state_id"];
    const kind = decision["target_state_kind"];
    let basis: StateNodeRef | null = null;
    if (typeof target === "string") {
      if (kind === "event") basis = { kind, eventId: target };
      if (kind === "application") basis = { kind, applicationId: target };
    }
    const savedSource = committedWorkspaceEvent(sql, theirs);
    if (typeof source !== "string" || savedSource?.head !== theirs || savedSource.eventId !== source ||
        !basis || workspaceCommitForRef(sql, ours, basis) !== ours) throw incomplete();
    byApplication.delete(introduced[0]);
    sources.add(source);
  }
  if (byApplication.size > 0) throw incomplete();
  return [...sources];
}

/** The changed placements and the incoming applications that account for them. */
export interface WorkspaceMergeScopeEntry {
  coordinate: IntegrationDecisionRecord["entries"][number]["coordinate"];
  changeIds: string[];
}

export function workspaceMergeScope(sql: SqlStorage, base: string, source: string) {
  const rows = sql.exec(
    `WITH changed(kind, id) AS (
       SELECT 'file', COALESCE(to_file_id, from_file_id) FROM dolt_diff_files(?1, ?2)
       UNION
       SELECT 'repository', COALESCE(to_repository_id, from_repository_id)
         FROM dolt_diff_repositories(?1, ?2)
     ), incoming_changes AS (
       SELECT DISTINCT applied.change_id,
              CASE WHEN coord.file_id IS NOT NULL THEN 'file' ELSE 'repository' END AS kind,
              COALESCE(coord.file_id, coord.repository_id) AS id
         FROM dolt_at_applications(?2) AS app
         LEFT JOIN dolt_at_applications(?1) AS common USING (application_id)
         JOIN dolt_at_gad_applied_changes(?2) AS applied ON applied.application_id = app.application_id
         JOIN dolt_at_gad_change_coordinates(?2) AS coord ON coord.change_id = applied.change_id
        WHERE common.application_id IS NULL
     )
     SELECT placement.kind, placement.id, effect.change_id
       FROM changed AS placement LEFT JOIN incoming_changes AS effect USING (kind, id)
      ORDER BY placement.kind, placement.id, effect.change_id`,
    base,
    source,
  ).toArray();
  const scope = new Map<string, WorkspaceMergeScopeEntry>();
  for (const { kind, id, change_id } of rows) {
    if ((kind !== "file" && kind !== "repository") || typeof id !== "string") {
      throw new Error("Workspace merge encountered an invalid placement coordinate");
    }
    const key = canonicalJson([kind, id]);
    let entry = scope.get(key);
    if (!entry) {
      entry = { coordinate: { kind, id }, changeIds: [] };
      scope.set(key, entry);
    }
    if (typeof change_id === "string") entry.changeIds.push(change_id);
  }
  return scope;
}

/** Resolve the latest applied change or the original snapshot of each selected file. */
export function workspaceContentOriginsAt(
  sql: SqlStorage,
  commit: string,
  fileIds: readonly string[],
): Map<string, FileContentOrigin> {
  const origins = new Map<string, FileContentOrigin>();
  if (fileIds.length === 0) return origins;
  const applied = SemanticWorkspace.readAppliedFileChanges(
    sql,
    workspaceApplicationsAt(sql, commit),
    fileIds,
    commit,
  );
  for (const [fileId, change] of applied) {
    origins.set(fileId, {
      ref: { kind: "applied-change", appliedChangeId: change.appliedChangeId },
      content: change.content,
      authoredChangeId: change.changeId,
      authoredByWorkUnitId: change.workUnitId,
      contentClass: change.contentClass,
      externalKeys: change.externalKeys,
    });
  }
  const missing = new Set(fileIds.filter((fileId) => !origins.has(fileId)));
  if (missing.size === 0) return origins;
  const snapshots = sql.exec(
    `SELECT event_id, snapshot_source FROM dolt_at_events(?)
      WHERE kind = 'genesis' AND snapshot_source IS NOT NULL`,
    commit,
  ).toArray();
  for (const { event_id, snapshot_source } of snapshots) {
    if (typeof event_id !== "string" || typeof snapshot_source !== "string")
      throw new Error(`Invalid workspace snapshot at ${commit}`);
    const state = { kind: "event" as const, eventId: event_id };
    const at = workspaceCommitForRef(sql, commit, state);
    if (!at) throw new Error(`Workspace snapshot ${event_id} has no origin`);
    const snapshot = JSON.parse(snapshot_source) as Record<string, unknown>;
    if (typeof snapshot["sourceUri"] !== "string" || typeof snapshot["snapshotRevision"] !== "string")
      throw new Error(`Invalid workspace snapshot source at ${at}`);
    const basis = workspaceEditBasisAt(sql, at);
    for (const fileId of missing) {
      const file = basis.file(fileId);
      if (!file) continue;
      origins.set(fileId, {
        ref: { kind: "file", state, repositoryId: file.repositoryId, fileId },
        content: {
          fileId,
          contentHash: file.contentHash,
          coordinateKind: file.contentKind === "text" ? "utf16" : "byte",
          coordinateExtent: file.coordinateExtent,
        },
        authoredChangeId: null,
        authoredByWorkUnitId: null,
        contentClass: "external",
        externalKeys: [`repo:${snapshot["sourceUri"]}@${snapshot["snapshotRevision"]}`],
      });
      missing.delete(fileId);
    }
  }
  return origins;
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
  createSemanticHistoryTables(sql, "dolt");
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
export function applyDoltWorkspaceState(sql: SqlStorage, change: WorkspacePlacementChange): void {
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
  expected: WorkspacePlacementChange
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

function canonicalPlacementRows(rows: {
  repositories: readonly (readonly unknown[])[];
  files: readonly (readonly unknown[])[];
}): string {
  const byIdentity = (left: readonly unknown[], right: readonly unknown[]) =>
    compareUtf16CodeUnits(String(left[0]), String(right[0]));
  return compactId("workspace-placement-proof", {
    repositories: [...rows.repositories].sort(byIdentity),
    files: [...rows.files].sort(byIdentity),
  });
}

export function expectedPlacementProof(change: WorkspacePlacementChange): string {
  return canonicalPlacementRows(placementRows(change));
}

export function workspacePlacementProof(sql: SqlStorage, at?: string): string {
  function rows(table: "repositories" | "files", columns: readonly string[]) {
    const target = at === undefined ? table : `dolt_at_${table}(?)`;
    return sql.exec(`SELECT ${columns.join(", ")} FROM ${target}`, ...(at === undefined ? [] : [at]))
      .toArray().map((row) => columns.map((key) => row[key]));
  }
  return canonicalPlacementRows({
    repositories: rows("repositories", repositoryColumns),
    files: rows("files", fileColumns),
  });
}

function placementRows(change: WorkspacePlacementChange, side: "result" | "expected" = "result") {
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
