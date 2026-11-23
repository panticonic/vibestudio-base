import { canonicalJson } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import {
  workspaceFileStateIdentity,
  workspaceRepositoryStateIdentity,
  type WorkspaceFileState,
  type WorkspaceRepositoryMember,
} from "@workspace/vcs-engine";
import { placementTombstone, priorPlacement } from "./doltWorkspaceProvenance.js";
import {
  workspaceApplicationsAt,
  workspaceContentOriginsAt,
  workspaceEditBasisAt,
  workspaceTransferBasisAt,
} from "./doltWorkspaceState.js";
import type { ChangeRecord } from "./semanticHistoryRecords.js";
import { type WorkspaceRevertBasis, changeCoordinate, revertEndpointHolds } from "./workspaceMutation.js";
import { changeRecord } from "./workspaceHistoryReads.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";

const MAX_MANIFEST_FILES = 100_000;

/** The revert planner reads placements, tombstones and evidence at the same immutable commit. */
export function workspaceRevertBasisAt(sql: SqlStorage, commit: string): WorkspaceRevertBasis {
  const placement = workspaceEditBasisAt(sql, commit);
  const transfer = workspaceTransferBasisAt(sql, commit);
  const repositories = new Map<string, WorkspaceRepositoryMember | null>();
  const priorRepositories = new Map<string, { member: WorkspaceRepositoryMember; revision: string }>();
  const files = new Map<string, { state: WorkspaceFileState } | null>();
  let chronologicalChanges: ChangeRecord[] | undefined;
  const changes = () => {
    if (chronologicalChanges) return chronologicalChanges;
    const rows = sql.exec(
      `SELECT change.*
         FROM json_each(?2) selected
         JOIN dolt_at_gad_applied_changes(?1) applied ON applied.application_id = selected.value
         JOIN dolt_at_gad_changes(?1) change USING (change_id)
        ORDER BY CAST(selected.key AS INTEGER), applied.ordinal, change.change_id`,
      commit, canonicalJson(workspaceApplicationsAt(sql, commit)),
    ).toArray();
    const seen = new Set<string>();
    chronologicalChanges = rows.flatMap((row) => {
      const changeId = String(row["change_id"]);
      if (seen.has(changeId)) return [];
      seen.add(changeId);
      return [changeRecord(changeId, row)];
    });
    return chronologicalChanges;
  };
  const basis: WorkspaceRevertBasis = {
    change(changeId) {
      const row = sql.exec(
        "SELECT * FROM dolt_at_gad_changes(?) WHERE change_id = ?", commit, changeId,
      ).toArray()[0];
      return changeRecord(changeId, row);
    },
    repository(repositoryId) {
      const cached = repositories.get(repositoryId);
      if (cached !== undefined) return cached;
      const identity = { kind: "repository" as const, repositoryId };
      const tombstoneChangeId = placementTombstone(sql, commit, identity);
      let member: WorkspaceRepositoryMember | null = null;
      if (tombstoneChangeId) {
        const revision = priorPlacement(sql, commit, identity, tombstoneChangeId);
        const prior = workspaceTransferBasisAt(sql, revision).presentRepository(repositoryId);
        priorRepositories.set(prior.repositoryStateId, { member: prior, revision });
        member = workspaceRepositoryStateIdentity({
          repositoryId, presence: "deleted", tombstoneChangeId, priorRepositoryStateId: prior.repositoryStateId,
        });
      } else if (placement.repository(repositoryId)) {
        member = transfer.presentRepository(repositoryId);
      }
      repositories.set(repositoryId, member);
      return member;
    },
    priorRepository(repository) {
      return priorRepositories.get(repository.priorRepositoryStateId)?.member ?? null;
    },
    manifest(repository) {
      // Replayed legacy changes may carry legacy manifest IDs. The versioned
      // tombstone points to the exact native revision with those placements.
      const revision = priorRepositories.get(repository.repositoryStateId)?.revision ?? commit;
      const values = sql.exec(
        `SELECT file_id FROM dolt_at_files(?)
          WHERE repository_id = ? AND presence = 'placed' LIMIT ?`,
        revision, repository.repositoryId, MAX_MANIFEST_FILES + 1,
      ).toArray().map(({ file_id }) => {
        if (typeof file_id !== "string")
          throw new SemanticVcsError("IntegrityFailure", "Workspace manifest has an invalid file identity");
        return { fileId: file_id };
      });
      return values.length > MAX_MANIFEST_FILES
        ? { values: values.slice(0, MAX_MANIFEST_FILES), next: true }
        : { values, next: null };
    },
    file(fileId) {
      const cached = files.get(fileId);
      if (cached !== undefined) return cached;
      let state: WorkspaceFileState | null = placement.file(fileId);
      if (!state) {
        const identity = { kind: "file" as const, fileId };
        const tombstoneChangeId = placementTombstone(sql, commit, identity);
        if (tombstoneChangeId) {
          const revision = priorPlacement(sql, commit, identity, tombstoneChangeId);
          const previous = workspaceEditBasisAt(sql, revision).file(fileId);
          if (!previous)
            throw new SemanticVcsError("IntegrityFailure", "Workspace deletion has no prior file");
          state = workspaceFileStateIdentity({
            fileId, presence: "deleted", tombstoneChangeId, priorFileStateId: previous.fileStateId,
          });
        }
      }
      const result = state ? { state } : null;
      files.set(fileId, result);
      return result;
    },
    blockingChanges(original) {
      const coordinate = changeCoordinate(original);
      if (!coordinate) return [];
      const lineage = changes();
      const position = lineage.findIndex(({ changeId }) => changeId === original.changeId);
      if (position < 0) return [];
      return lineage.slice(position + 1).flatMap((change) =>
        changeCoordinate(change) === coordinate &&
        change.result && revertEndpointHolds(basis, change.result)
          ? [change.changeId] : [],
      );
    },
    latestFileChange(fileId) {
      const origin = workspaceContentOriginsAt(sql, commit, [fileId]).get(fileId);
      return origin?.authoredChangeId ? { changeId: origin.authoredChangeId } : null;
    },
  };
  return basis;
}
