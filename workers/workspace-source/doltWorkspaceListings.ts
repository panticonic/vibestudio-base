import { compareUtf16CodeUnits } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import type {
  VcsListDirectoryInput,
  VcsListDirectoryResult,
  VcsListFilesInput,
  VcsListFilesResult,
} from "@vibestudio/service-schemas/vcs";
import { compactId } from "@workspace/vcs-engine";
import {
  workspaceContentOriginsAt,
  workspaceEditBasisAt,
  workspaceFileReadsAt,
  workspaceSnapshotOriginsAt,
} from "./doltWorkspaceState.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";
import { parseSemanticCursor, semanticCursor } from "./semanticWorkspace.js";

type DirectoryEntry = NonNullable<VcsListDirectoryResult>["entries"][number];
type DirectoryCandidate = Omit<DirectoryEntry, "lineage"> & {
  repositoryId: string;
  witnessFileId?: string;
};

function filePaths(sql: SqlStorage, at: string, repositoryId: string, prefix: string) {
  const rows = sql.exec(
    `SELECT file_id, path FROM dolt_at_files(?) WHERE repository_id = ? AND presence = 'placed'
      AND substr(path, 1, length(?)) = ?`,
    at, repositoryId, prefix, prefix,
  ).toArray();
  return rows.map(({ file_id, path }) => {
    if (typeof file_id !== "string" || typeof path !== "string") {
      throw new SemanticVcsError("IntegrityFailure", "Workspace has an invalid file placement");
    }
    return { fileId: file_id, path };
  }).sort((left, right) => compareUtf16CodeUnits(left.path, right.path));
}

export function workspaceListFilesAt(sql: SqlStorage, at: string, input: VcsListFilesInput): VcsListFilesResult {
  const { state, repositoryId, prefix, cursor, limit } = input;
  if (!workspaceEditBasisAt(sql, at).repository(repositoryId)) {
    throw new SemanticVcsError("InvalidReference", "Workspace repository is absent from the selected state");
  }
  const basis = { state, repositoryId, prefix: prefix ?? null };
  const position = parseSemanticCursor(cursor, "list-files", basis)?.["path"];
  if (position !== undefined && typeof position !== "string") {
    throw new SemanticVcsError("InvalidReference", "List-files cursor has an invalid path");
  }
  const candidates = filePaths(sql, at, repositoryId, prefix ?? "")
    .filter(({ path }) => position === undefined || compareUtf16CodeUnits(path, position) > 0)
    .slice(0, limit + 1);
  const page = candidates.slice(0, limit);
  const descriptors = workspaceFileReadsAt(sql, at, {
    state,
    files: page.map(({ fileId }) => ({ repositoryId, file: { kind: "id", fileId } })),
  });
  const files = descriptors.map((file) => {
    if (!file) throw new SemanticVcsError("IntegrityFailure", "Workspace file disappeared from a fixed state");
    const { fileId, path, contentHash, contentKind, coordinateExtent, byteLength, mode,
      authoredChangeId, authoredByWorkUnitId, contentClass, externalKeys } = file;
    return { fileId, path, contentHash, contentKind, coordinateExtent, byteLength, mode,
      authoredChangeId, authoredByWorkUnitId, contentClass, externalKeys };
  });
  const last = page.at(-1);
  return {
    state, repositoryId, files,
    nextCursor: last && candidates.length > limit ? semanticCursor("list-files", basis, { path: last.path }) : null,
  };
}

function repositoryLineages(
  sql: SqlStorage,
  at: string,
  repositoryIds: readonly string[],
): Map<string, DirectoryEntry["lineage"]> {
  if (repositoryIds.length === 0) return new Map();
  const rows = sql.exec(
    `SELECT coordinate.repository_id, work.work_unit_id, work.content_class, work.external_lineage_json
       FROM json_each(?2) AS selected
       JOIN dolt_at_gad_change_coordinates(?1) AS coordinate
         ON coordinate.repository_id = selected.value AND coordinate.role = 'result' AND coordinate.file_id IS NULL
       JOIN dolt_at_gad_changes(?1) AS change USING (change_id)
       JOIN dolt_at_gad_work_units(?1) AS work USING (work_unit_id)
      WHERE change.kind = 'repo-add'`,
    at,
    JSON.stringify(repositoryIds),
  ).toArray();
  const origins = new Map<string, DirectoryEntry["lineage"]>();
  for (const { repository_id, work_unit_id, content_class, external_lineage_json } of rows) {
    if (typeof repository_id !== "string" || typeof work_unit_id !== "string" ||
        (content_class !== "internal" && content_class !== "external") ||
        typeof external_lineage_json !== "string" || origins.has(repository_id)) {
      throw new SemanticVcsError("IntegrityFailure", "Workspace has an invalid repository origin");
    }
    const externalKeys: unknown = JSON.parse(external_lineage_json);
    if (!Array.isArray(externalKeys) || !externalKeys.every((key) => typeof key === "string")) {
      throw new SemanticVcsError("IntegrityFailure", "Workspace has invalid repository lineage");
    }
    origins.set(repository_id, {
      authoredChangeId: null, authoredByWorkUnitId: work_unit_id, contentClass: content_class, externalKeys,
    });
  }
  const missing = new Set(repositoryIds.filter((id) => !origins.has(id)));
  if (missing.size > 0) {
    for (const snapshot of workspaceSnapshotOriginsAt(sql, at)) {
      const repository = workspaceEditBasisAt(sql, snapshot.at).repository;
      for (const id of missing) {
        if (!repository(id)) continue;
        origins.set(id, {
          authoredChangeId: null, authoredByWorkUnitId: null, contentClass: "external", externalKeys: snapshot.externalKeys,
        });
        missing.delete(id);
      }
    }
  }
  return origins;
}

export function workspaceListDirectoryAt(
  sql: SqlStorage, at: string, input: VcsListDirectoryInput,
): VcsListDirectoryResult {
  const { state, path, cursor, limit } = input;
  const basis = { state, path };
  const position = parseSemanticCursor(cursor, "list-directory", basis);
  const afterName = position?.["name"];
  const afterKind = position?.["kind"];
  if ((afterName !== undefined && typeof afterName !== "string") ||
      (afterKind !== undefined && afterKind !== "file" && afterKind !== "directory")) {
    throw new SemanticVcsError("InvalidReference", "List-directory cursor has an invalid position");
  }

  const repositories = sql.exec(
    "SELECT repository_id, repo_path FROM dolt_at_repositories(?) WHERE presence = 'present'",
    at,
  ).toArray().map(({ repository_id, repo_path }) => {
    if (typeof repository_id !== "string" || typeof repo_path !== "string")
      throw new SemanticVcsError("IntegrityFailure", "Workspace has an invalid active repository");
    return { repositoryId: repository_id, repoPath: repo_path };
  }).sort((left, right) => compareUtf16CodeUnits(left.repoPath, right.repoPath));
  const containing = repositories.filter(({ repoPath }) => path === repoPath || path.startsWith(`${repoPath}/`))
    .sort((left, right) => right.repoPath.length - left.repoPath.length)[0];
  const candidates: DirectoryCandidate[] = [];
  const emitted = new Set<string>();
  const add = (candidate: DirectoryCandidate) => {
    if (afterName !== undefined) {
      const next = containing && candidate.kind === "directory" ? `${candidate.name}/` : candidate.name;
      const previous = containing && afterKind === "directory" ? `${afterName}/` : afterName;
      if (compareUtf16CodeUnits(next, previous) <= 0) return;
    }
    const key = `${candidate.kind}:${candidate.name}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    candidates.push(candidate);
  };
  const childPath = (name: string) => path ? `${path}/${name}` : name;
  if (containing) {
    const { repositoryId, repoPath } = containing;
    const relative = path === repoPath ? "" : path.slice(repoPath.length + 1);
    const prefix = relative ? `${relative}/` : "";
    for (const { fileId, path: filePath } of filePaths(sql, at, repositoryId, prefix)) {
      const remaining = filePath.slice(prefix.length);
      const slash = remaining.indexOf("/");
      const name = slash === -1 ? remaining : remaining.slice(0, slash);
      add({
        name,
        path: childPath(name),
        kind: slash === -1 ? "file" : "directory",
        identity: slash === -1 ? `file:${fileId}`
          : compactId("directory", { repositoryId, path: filePath.slice(0, prefix.length + name.length) }),
        repositoryId,
        repositoryRoot: false,
        fileId: slash === -1 ? fileId : null,
        witnessFileId: fileId,
      });
      if (candidates.length > limit) break;
    }
  } else {
    const prefix = path ? `${path}/` : "";
    for (const { repositoryId, repoPath } of repositories) {
      if (!repoPath.startsWith(prefix)) continue;
      const [name] = repoPath.slice(prefix.length).split("/");
      if (!name || (afterName !== undefined && compareUtf16CodeUnits(name, afterName) <= 0)) continue;
      const entry = childPath(name);
      add({
        name, path: entry, kind: "directory", identity: compactId("directory", { path: entry }),
        repositoryId, repositoryRoot: entry === repoPath, fileId: null,
      });
      if (candidates.length > limit) break;
    }
  }
  if (candidates.length === 0 && path !== (containing?.repoPath ?? "")) return null;
  const page = candidates.slice(0, limit);
  const fileIds = page.flatMap(({ witnessFileId }) => witnessFileId ? [witnessFileId] : []);
  const repositoryIds = [...new Set(page.flatMap(({ witnessFileId, repositoryId }) => witnessFileId ? [] : [repositoryId]))];
  const fileOrigins = workspaceContentOriginsAt(sql, at, fileIds);
  const repositoryOrigins = repositoryLineages(sql, at, repositoryIds);
  const entries = page.map(({ witnessFileId, ...candidate }): DirectoryEntry => {
    const origin = witnessFileId ? fileOrigins.get(witnessFileId) : repositoryOrigins.get(candidate.repositoryId);
    if (!origin) throw new SemanticVcsError("IntegrityFailure", `Workspace directory has no lineage for ${candidate.path}`);
    const { authoredChangeId, authoredByWorkUnitId, contentClass, externalKeys } = origin;
    return { ...candidate, lineage: { authoredChangeId, authoredByWorkUnitId, contentClass, externalKeys } };
  });
  const last = page.at(-1);
  return {
    state, path, entries,
    nextCursor: last && candidates.length > limit
      ? semanticCursor("list-directory", basis, { name: last.name, kind: last.kind })
      : null,
  };
}
