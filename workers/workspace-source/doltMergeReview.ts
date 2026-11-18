import { canonicalJson } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import type { VcsCompareResult, VcsMergeCoordinateRef } from "@vibestudio/service-schemas/vcs";
import { classifyMergeAspect } from "@workspace/vcs-engine";
import { workspaceEditBasisAt, workspaceMergeScope, type WorkspaceMergeScopeEntry } from "./doltWorkspaceState.js";
import type { HistoryMergeSelection } from "./doltTextMerge.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";
import type { WorkspaceEditBasis } from "./semanticWorkspace.js";

type Coordinate = VcsCompareResult["coordinates"][number];
type Side = "base" | "ours" | "theirs";
type Placement = {
  path: string | null;
  fields: Partial<Record<Coordinate["aspects"][number]["aspect"], unknown>>;
};

function placement(basis: WorkspaceEditBasis, coordinate: VcsMergeCoordinateRef): Placement {
  if (coordinate.kind === "repository") {
    const repository = basis.repository(coordinate.id);
    return {
      path: repository?.repoPath ?? null,
      fields: { presence: Boolean(repository), path: repository?.repoPath ?? null },
    };
  }
  const file = basis.file(coordinate.id);
  if (!file) {
    return { path: null, fields: { presence: false, placement: null, mode: null, content: null } };
  }
  const repository = basis.repository(file.repositoryId);
  if (!repository) throw new SemanticVcsError("IntegrityFailure", "Merge placement has no repository");
  return {
    path: repository.repoPath ? `${repository.repoPath}/${file.path}` : file.path,
    fields: {
      presence: true,
      placement: { repositoryId: file.repositoryId, path: file.path },
      mode: file.mode,
      content: { hash: file.contentHash, kind: file.contentKind },
    },
  };
}

function changeAuthors(sql: SqlStorage, at: string, changeIds: Iterable<string>) {
  const ids = [...new Set(changeIds)];
  if (ids.length === 0) return new Map<string, string>();
  const rows = sql.exec(
    `SELECT changes.change_id, changes.work_unit_id
       FROM json_each(?2) AS selected
       JOIN dolt_at_gad_changes(?1) AS changes ON changes.change_id = selected.value`,
    at,
    JSON.stringify(ids),
  ).toArray();
  const authors = new Map<string, string>();
  for (const { change_id, work_unit_id } of rows) {
    if (typeof change_id !== "string" || typeof work_unit_id !== "string") {
      throw new SemanticVcsError("IntegrityFailure", "Merge change has no author");
    }
    authors.set(change_id, work_unit_id);
  }
  if (authors.size !== ids.length) {
    throw new SemanticVcsError("IntegrityFailure", "Merge attribution is missing a change");
  }
  return authors;
}

/** Read differences and their authors from the three immutable native revisions. */
export function historyMergePlacements(
  sql: SqlStorage,
  selection: HistoryMergeSelection,
  incoming: ReadonlyMap<string, WorkspaceMergeScopeEntry>,
) {
  const { base, head, main } = selection;
  if (incoming.size > 10_000) {
    throw new SemanticVcsError("ScopeTooLarge", "Workspace merge comparison exceeds its coordinate bound");
  }
  if (incoming.size === 0) return [];
  const local = base === head
    ? new Map<string, WorkspaceMergeScopeEntry>()
    : workspaceMergeScope(sql, base, head);
  const oursIds = [...incoming.keys()].flatMap((key) => local.get(key)?.changeIds ?? []);
  const oursAuthors = changeAuthors(sql, head, oursIds);
  const theirsAuthors = changeAuthors(sql, main, [...incoming.values()].flatMap(({ changeIds }) => changeIds));
  const views = {
    base: workspaceEditBasisAt(sql, base),
    ours: workspaceEditBasisAt(sql, head),
    theirs: workspaceEditBasisAt(sql, main),
  };
  const attribution = (changeIds: string[], authors: Map<string, string>) =>
    changeIds.map((changeId) => ({ changeId, workUnitId: authors.get(changeId)! }));
  return [...incoming].map(([key, entry]) => {
    const coordinate = entry.coordinate;
    const locations = {
      base: placement(views.base, coordinate),
      ours: placement(views.ours, coordinate),
      theirs: placement(views.theirs, coordinate),
    };
    const paths: Coordinate["coordinate"]["paths"] = {};
    for (const side of ["base", "ours", "theirs"] satisfies Side[]) {
      const path = locations[side].path;
      if (path !== null) paths[side] = path;
    }
    const aspects: Coordinate["aspects"] = [];
    const aspectNames = Object.keys(locations.base.fields) as Array<Coordinate["aspects"][number]["aspect"]>;
    for (const aspect of aspectNames) {
      const before = locations.base.fields[aspect];
      const ours = locations.ours.fields[aspect];
      const theirs = locations.theirs.fields[aspect];
      const values = { base: canonicalJson(before), ours: canonicalJson(ours), theirs: canonicalJson(theirs) };
      if (values.base === values.ours && values.base === values.theirs) continue;
      const status = classifyMergeAspect({ aspect, ...values });
      aspects.push({ aspect, base: before, ours, theirs, status });
    }
    return {
      coordinate: { ...coordinate, paths },
      aspects,
      attribution: {
        ours: attribution(local.get(key)?.changeIds ?? [], oursAuthors),
        theirs: attribution(entry.changeIds, theirsAuthors),
      },
    };
  });
}
