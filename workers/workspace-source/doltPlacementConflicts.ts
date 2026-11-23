import { canonicalJson } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import type { DoltMergeSession } from "@vibestudio/durable/dolt";
import { restoreDoltFileRow } from "./doltWorkspaceState.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";

type Violation = DoltMergeSession["violations"][number];

/** Retain the reviewed local placement and restore the source file to its local state. */
export function declineHistoryFileCollisions(
  sql: SqlStorage,
  merge: DoltMergeSession,
  decide: (incomingFileId: string) => void,
): void {
  const unsupported = () => new SemanticVcsError(
    "ConflictPresent",
    "Workspace integration needs an exact placement resolution",
  );
  const groups = new Map<string, { repositoryId: string; path: string; violations: Violation[] }>();
  for (const violation of merge.violations) {
    const { table, type, row, info } = violation;
    const repositoryId = row["repository_id"];
    const path = row["path"];
    if (
      table !== "files" || type !== "unique index" || typeof repositoryId !== "string" ||
      typeof path !== "string" || !info || typeof info !== "object" ||
      !("Name" in info) || info.Name !== "files_placement"
    ) throw unsupported();
    const key = canonicalJson([repositoryId, path]);
    const group = groups.get(key);
    if (group) group.violations.push(violation);
    else groups.set(key, { repositoryId, path, violations: [violation] });
  }

  for (const { repositoryId, path, violations } of groups.values()) {
    const fileIds = (at?: string) => sql.exec(
      `SELECT file_id FROM ${at ? "dolt_at_files(?)" : "files"}
        WHERE presence = 'placed' AND repository_id = ? AND path = ?`,
      ...(at ? [at] : []), repositoryId, path,
    ).toArray().map((row) => row["file_id"]);
    const ours = fileIds(merge.ours);
    const theirs = fileIds(merge.theirs);
    const [localId] = ours;
    const [incomingId] = theirs;
    const marked = new Set(violations.map(({ row }) => row["file_id"]));
    if (ours.length !== 1 || theirs.length !== 1 || typeof localId !== "string" ||
        typeof incomingId !== "string" || localId === incomingId ||
        marked.size !== 2 || !marked.has(localId) || !marked.has(incomingId)) throw unsupported();
    decide(incomingId);
    restoreDoltFileRow(sql, merge.ours, incomingId);
    const placed = fileIds();
    if (placed.length !== 1 || placed[0] !== localId) {
      throw new SemanticVcsError("IntegrityFailure", "Workspace merge failed to restore the reviewed placement");
    }
    for (const violation of violations) violation.resolve();
  }
}
