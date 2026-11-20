import { canonicalJson, compareUtf16CodeUnits } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import type { VcsCompareInput, VcsCompareResult, VcsMergeCoordinateRef, VcsMergeResult, VcsWorkingMutationResult } from "@vibestudio/service-schemas/vcs";
import { classifyMergeAspect, resolveIntent, type ResolvedIntent } from "@workspace/vcs-engine";
import { workspaceContentOriginsAt, workspaceEditBasisAt, workspaceMergeScope, type WorkspaceMergeScopeEntry } from "./doltWorkspaceState.js";
import { composeHistoryText, historyTextMergeInputs, readHistoryMergeObservations, type HistoryMergeObservation, type HistoryMergeSelection } from "./doltTextMerge.js";
import type { MainMergePreview } from "./participantHistory.js";
import { PROV_RESOLVER_PROTOCOL } from "./provenanceViews.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";
import type { ChangeRecord } from "./semanticVcsStore.js";
import { describeSemanticEffects, parseSemanticCursor, semanticCursor, type WorkspaceEditBasis } from "./semanticWorkspace.js";
import { trajectorySenderRef } from "./trajectoryEvidence.js";

export type HistoryMergeCoordinate = VcsCompareResult["coordinates"][number];
type Coordinate = HistoryMergeCoordinate;
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

export type HistoryMergeReview =
  | { kind: "read-content"; contentHashes: string[] }
  | { kind: "reviewed"; result: VcsCompareResult };

export function reviewIntents(
  sql: SqlStorage,
  preview: Pick<HistoryMergeSelection, "head" | "main">,
  coordinates: Coordinate[],
  decisions?: ReadonlyMap<string, { resolution: string }>,
) {
  const intents: VcsCompareResult["intents"] = [];
  const intentCounts: VcsCompareResult["intentCounts"] = { merged: 0, settled: 0, split: 0, contested: 0, pending: 0 };
  for (const side of ["theirs", "ours"] as const) {
    const work = new Map<string, Coordinate[]>();
    for (const coordinate of coordinates) {
      const authors = new Set(coordinate.attribution[side].map(({ workUnitId }) => workUnitId));
      for (const id of authors) {
        const owned = work.get(id) ?? [];
        owned.push(coordinate);
        work.set(id, owned);
      }
    }
    if (work.size === 0) continue;
    const at = side === "theirs" ? preview.main : preview.head;
    const rows = sql.exec(
      `SELECT work.work_unit_id, work.kind, work.intent_summary, work.trigger_excerpt, work.trigger_sender_json,
              work.resolved_intent_text, work.resolved_intent_tier
         FROM json_each(?2) AS selected
         JOIN dolt_at_gad_work_units(?1) AS work ON work.work_unit_id = selected.value
        ORDER BY work.work_unit_id`,
      at,
      JSON.stringify([...work.keys()]),
    ).toArray();
    if (rows.length !== work.size)
      throw new SemanticVcsError("IntegrityFailure", "Merge comparison is missing a work unit");
    for (const row of rows) {
      const { work_unit_id, kind, intent_summary, trigger_excerpt, trigger_sender_json,
        resolved_intent_text: text, resolved_intent_tier: tier } = row;
      const selected = typeof work_unit_id === "string" ? work.get(work_unit_id) : undefined;
      if (!selected || typeof work_unit_id !== "string" || typeof kind !== "string") {
        throw new SemanticVcsError("IntegrityFailure", "Invalid merge work unit");
      }
      const intent: VcsCompareResult["intents"][number]["intent"] =
        typeof text === "string" && text && (tier === "stated" || tier === "trigger" || tier === "mechanical")
        ? { text, tier }
        : readHistoryWorkIntent(sql, at, work_unit_id, kind, intent_summary, trigger_excerpt, trigger_sender_json);
      const conflicts = selected.filter(({ status }) => status === "conflict").length;
      const state = side === "ours" ? undefined
        : decisions ? (selected.every(({ coordinate, status }) => {
            const resolution = decisions.get(canonicalJson([coordinate.kind, coordinate.id]))?.resolution;
            return status === "convergent" || resolution === "ours" || resolution === "current";
          }) ? "settled" : "merged")
        : conflicts === selected.length ? "contested"
        : conflicts > 0 ? "split"
        : selected.some(({ status }) => status === "adopt" || status === "composed") ? "pending"
        : selected.some(({ status }) => status === "convergent") ? "settled" : "merged";
      if (state) intentCounts[state]++;
      intents.push({
        workUnitId: work_unit_id,
        side,
        intent,
        coordinates: selected.slice(0, 500).map(({ coordinate: { kind, id } }) => ({ kind, id })),
        ...(state ? { state } : {}),
      });
    }
  }
  return { intents: intents.slice(0, 500), intentCounts, intentsTruncated: intents.length > 500 };
}

export function readHistoryWorkIntent(
  sql: SqlStorage, at: string, workUnitId: string, kind: string,
  statement: unknown, excerpt: unknown, senderJson: unknown,
) {
  const sender = typeof senderJson === "string" ? trajectorySenderRef(JSON.parse(senderJson)) : null;
  const changes = sql.exec(
    `SELECT kind, result_json, base_json FROM dolt_at_gad_changes(?)
      WHERE work_unit_id = ? ORDER BY operation, ordinal, change_id`,
    at,
    workUnitId,
  ).toArray().map(({ kind, result_json, base_json }) => ({
    kind: kind as ChangeRecord["kind"],
    result: typeof result_json === "string" ? JSON.parse(result_json) as ChangeRecord["result"] : null,
    base: typeof base_json === "string" ? JSON.parse(base_json) as ChangeRecord["base"] : null,
  }));
  return resolveIntent({
    stated: typeof statement === "string" ? statement : null,
    trigger: typeof excerpt === "string" && sender ? { text: excerpt, sender: sender.id } : null,
    mechanical: describeSemanticEffects(kind, changes),
  });
}

/** Project actual native conflicts while keeping immutable paths and authors visible. */
export function reviewHistoryMerge(
  sql: SqlStorage,
  input: VcsCompareInput,
  base: VcsCompareResult["base"],
  preview: MainMergePreview,
  observation: HistoryMergeObservation | null,
): HistoryMergeReview {
  const rowConflicts = new Set<string>();
  for (const { table, key } of preview.conflicts) {
    const id = table === "files" ? key["file_id"] : table === "repositories" ? key["repository_id"] : null;
    if (typeof id !== "string")
      throw new SemanticVcsError("ConflictPresent", "Native merge has a conflict outside workspace placements");
    rowConflicts.add(canonicalJson([table === "files" ? "file" : "repository", id]));
  }
  const pathCollisions = new Map<string, VcsMergeCoordinateRef[]>();
  for (const { table, row } of preview.violations) {
    const file = table === "files";
    const id = file ? row["file_id"] : row["repository_id"];
    const path = file ? [row["repository_id"], row["path"]] : [row["repo_path"]];
    if ((table !== "files" && table !== "repositories") || typeof id !== "string" ||
        path.some((part) => typeof part !== "string")) {
      throw new SemanticVcsError("ConflictPresent", "Native merge has an unsupported placement violation");
    }
    const group = canonicalJson([table, ...path]);
    const members = pathCollisions.get(group) ?? [];
    members.push({ kind: file ? "file" : "repository", id });
    pathCollisions.set(group, members);
  }
  const groups = new Map<string, { group: string; peers: VcsMergeCoordinateRef[] }>();
  for (const [group, members] of pathCollisions) {
    for (const member of members) {
      groups.set(canonicalJson([member.kind, member.id]), {
        group,
        peers: members.filter(({ id }) => id !== member.id),
      });
    }
  }
  const candidates = new Map(preview.placements.flatMap(({ coordinate }) => {
    const key = canonicalJson([coordinate.kind, coordinate.id]);
    if (coordinate.kind !== "file" || groups.has(key) || !rowConflicts.has(key)) return [];
    const inputs = historyTextMergeInputs(sql, preview, coordinate.id);
    return inputs ? [[key, inputs] as const] : [];
  }));
  const hashes = [...new Set([...candidates.values()].flatMap(({ before, ours, theirs }) =>
    [before.contentHash, ours.contentHash, theirs.contentHash],
  ))].sort(compareUtf16CodeUnits);
  if (hashes.length > 0 && !observation) return { kind: "read-content", contentHashes: hashes };
  const observed = observation ? readHistoryMergeObservations(hashes, observation) : new Map<string, string>();
  const incoming = new Map(preview.incoming.map(({ coordinate, changeIds }) =>
    [canonicalJson([coordinate.kind, coordinate.id]), changeIds] as const,
  ));
  const coordinates: Coordinate[] = preview.placements.map((placement) => {
    const { kind, id, paths } = placement.coordinate;
    const key = canonicalJson([kind, id]);
    const collision = groups.get(key);
    const candidate = candidates.get(key);
    const composed = candidate && composeHistoryText(sql, preview, candidate, observed, 0, incoming.get(key) ?? []);
    const aspects = placement.aspects.map((aspect) =>
      composed && aspect.aspect === "content" ? { ...aspect, status: "composed" as const } : aspect,
    );
    let status: Coordinate["status"];
    if (collision || (rowConflicts.has(key) && !composed)) status = "conflict";
    else if (composed || (aspects.some(({ status }) => status === "adopt") &&
        aspects.some(({ status }) => status === "ours"))) status = "composed";
    else if (aspects.some(({ status }) => status === "adopt")) status = "adopt";
    else status = "convergent";
    return {
      ...placement,
      aspects,
      status,
      ...(collision && collision.peers.length > 0 ? { group: collision.group, structuralConflicts: collision.peers } : {}),
      resolutions: collision ? (kind === "file" ? ["ours", "current"] : [])
        : composed ? ["composed", "theirs", "ours", "current"] : ["theirs", "ours", "current"],
      summary: `${status} ${kind} ${paths.theirs ?? paths.ours ?? id}`,
    };
  });
  return paginateHistoryComparison(input, base, coordinates, reviewIntents(sql, preview, coordinates), preview.main === preview.base);
}

export function paginateHistoryComparison(
  input: VcsCompareInput,
  base: VcsCompareResult["base"],
  coordinates: Coordinate[],
  intents: ReturnType<typeof reviewIntents>,
  concluded: boolean,
): Extract<HistoryMergeReview, { kind: "reviewed" }> {
  const counts: VcsCompareResult["counts"] = { adopt: 0, convergent: 0, composed: 0, conflict: 0, resolved: 0 };
  for (const { status } of coordinates) counts[status]++;
  const remaining = counts.adopt + counts.composed + counts.conflict;
  const { target, source, statusFilter, cursor, limit } = input;
  const basis = { target, source, ...(statusFilter ? { statusFilter } : {}) };
  const position = parseSemanticCursor(cursor, "compare", basis);
  const offset = position?.["offset"] ?? 0;
  if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0) {
    throw new SemanticVcsError("InvalidReference", "Invalid workspace comparison position");
  }
  const filtered = statusFilter ? coordinates.filter(({ status }) => status === statusFilter) : coordinates;
  const shown = filtered.slice(offset, offset + limit);
  const nextCursor = offset + limit < filtered.length
    ? semanticCursor("compare", basis, { offset: offset + limit })
    : null;
  return {
    kind: "reviewed",
    result: {
      target, source, base,
      counts,
      resolution: { remainingCoordinateCount: remaining, complete: remaining === 0, concluded },
      coordinates: shown,
      ...intents,
      nextCursor,
    },
  };
}

/** Rebuild the public receipt from the merge's immutable application and decisions. */
export function settledHistoryMerge(
  sql: SqlStorage,
  selection: HistoryMergeSelection,
  committedHead: string,
  mutation: VcsWorkingMutationResult,
): Extract<VcsMergeResult, { status: "working" }> {
  const scope = workspaceMergeScope(sql, selection.base, selection.main);
  const placements = historyMergePlacements(sql, selection, scope);
  const decisions = new Map<string, { decisionId: string; resolution: string }>();
  if (mutation.decisionIds.length > 0) {
    const rows = sql.exec(
      `SELECT entry.decision_id, entry.coordinate_kind, entry.coordinate_id, entry.resolution
        FROM json_each(?2) AS selected
        JOIN dolt_at_gad_merge_decision_entries(?1) AS entry ON entry.decision_id = selected.value`,
      committedHead,
      JSON.stringify(mutation.decisionIds),
    ).toArray();
    for (const { decision_id, coordinate_kind, coordinate_id, resolution } of rows) {
      if (typeof decision_id !== "string" || typeof coordinate_id !== "string" ||
          (coordinate_kind !== "file" && coordinate_kind !== "repository") || typeof resolution !== "string") {
        throw new SemanticVcsError("IntegrityFailure", "Invalid recorded merge decision");
      }
      const key = canonicalJson([coordinate_kind, coordinate_id]);
      if (decisions.has(key))
        throw new SemanticVcsError("IntegrityFailure", "Workspace merge recorded multiple decisions for a placement");
      decisions.set(key, { decisionId: decision_id, resolution });
    }
  }
  const outcomes: Coordinate[] = placements.map((placement) => {
    const { kind, id, paths } = placement.coordinate;
    const decision = decisions.get(canonicalJson([kind, id]));
    const composed = decision?.resolution === "composed";
    const aspects = placement.aspects.map((aspect) =>
      composed && aspect.aspect === "content" ? { ...aspect, status: "composed" as const } : aspect,
    );
    const adopted = aspects.some(({ status }) => status === "adopt");
    const kept = aspects.some(({ status }) => status === "ours");
    const status = composed || (!decision && adopted && kept) ? "composed"
      : decision ? "resolved" : adopted ? "adopt" : "convergent";
    return {
      ...placement, aspects, status,
      ...(decision ? { decisionId: decision.decisionId } : {}),
      resolutions: [],
      summary: `${status} ${kind} ${paths.theirs ?? paths.ours ?? id}`,
    };
  });
  const counts: VcsCompareResult["counts"] = { adopt: 0, convergent: 0, composed: 0, conflict: 0, resolved: 0 };
  for (const { status } of outcomes) counts[status]++;
  const { intents, intentsTruncated } = reviewIntents(sql, selection, outcomes, decisions);
  const composedFiles = outcomes.filter(({ coordinate }) =>
    coordinate.kind === "file" &&
    decisions.get(canonicalJson([coordinate.kind, coordinate.id]))?.resolution === "composed",
  ).slice(0, 500).map(({ coordinate }) => coordinate.id);
  const oursOrigins = workspaceContentOriginsAt(sql, selection.head, composedFiles);
  const theirsOrigins = workspaceContentOriginsAt(sql, selection.main, composedFiles);
  const composed = composedFiles.map((id) => ({
    coordinate: { kind: "file" as const, id },
    ours: readHistoryWorkUnitIntent(sql, selection.head, oursOrigins.get(id)?.authoredByWorkUnitId),
    theirs: readHistoryWorkUnitIntent(sql, selection.main, theirsOrigins.get(id)?.authoredByWorkUnitId),
  }));
  return {
    ...mutation,
    status: "working",
    ...(mutation.decisionIds[0] ? { decisionId: mutation.decisionIds[0] } : {}),
    outcomes: outcomes.slice(0, 500),
    resolution: { remainingCoordinateCount: 0, complete: true, concluded: true },
    counts,
    intents, intentsTruncated,
    composed,
    conflicts: [],
    nextConflictCursor: null,
  };
}

export function readHistoryWorkUnitIntent(
  sql: SqlStorage, at: string, workUnitId: string | null | undefined,
): ResolvedIntent {
  if (!workUnitId) throw new SemanticVcsError("IntegrityFailure", "Workspace content origin has no work unit");
  const row = sql.exec(
    `SELECT kind, intent_summary, trigger_excerpt, trigger_sender_json,
            resolved_intent_text, resolved_intent_tier, resolver_protocol
      FROM dolt_at_gad_work_units(?) WHERE work_unit_id = ?`,
    at,
    workUnitId,
  ).toArray()[0];
  if (!row || typeof row["kind"] !== "string")
    throw new SemanticVcsError("IntegrityFailure", "Workspace work unit has no intent evidence");
  const tier = row["resolved_intent_tier"];
  const text = row["resolved_intent_text"];
  if (row["resolver_protocol"] === PROV_RESOLVER_PROTOCOL && typeof text === "string" && text &&
      (tier === "stated" || tier === "trigger" || tier === "mechanical")) {
    return { tier, text };
  }
  return readHistoryWorkIntent(sql, at, workUnitId, row["kind"], row["intent_summary"], row["trigger_excerpt"], row["trigger_sender_json"]);
}
