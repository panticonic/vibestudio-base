import { canonicalJson, compareUtf16CodeUnits } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import {
  vcsAppliedChangeSchema,
  vcsChangeSchema,
  vcsExternalDeltaResultSchema,
  vcsFileStateSchema,
  vcsIntegrationDecisionSchema,
  vcsRepositoryStateSchema,
  vcsSemanticNodeRefSchema,
  vcsWorkApplicationSchema,
  vcsWorkUnitSchema,
  vcsWorkspaceEventSchema,
  type VcsInspectResult,
  type VcsHistoryInput,
  type VcsHistoryResult,
  type VcsNeighborsInput,
  type VcsNeighborsResult,
  type VcsProvenanceEdge,
  type VcsSemanticNodeRef,
} from "@vibestudio/service-schemas/vcs";
import { NORMALIZATION_PROTOCOL, SEMANTIC_PROTOCOL, type StateNodeRef } from "@workspace/vcs-engine";
import { readHistoryWorkIntent, readHistoryWorkUnitIntent } from "./doltMergeReview.js";
import {
  committedWorkspaceEvent,
  placementMergeParents,
  workspaceApplicationsAt,
  workspaceCommitForRef,
  workspaceEditBasisAt,
  workspaceMergeSourcesAt,
  workspaceTransferBasisAt,
} from "./doltWorkspaceState.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";
import { MAX_ANCESTRY_EDGES, parseSemanticCursor, semanticCursor } from "./workspaceHistoryPagination.js";
import { changeEffects, publicChangeKind } from "./workspaceHistoryReads.js";

function parentsAt(sql: SqlStorage, revision: string) {
  return sql.exec(
    `SELECT parent_hash FROM dolt_commit_ancestors
      WHERE commit_hash = ? AND parent_hash IS NOT NULL ORDER BY parent_index`,
    revision,
  ).toArray().map(({ parent_hash }) => {
    if (typeof parent_hash !== "string") throw new SemanticVcsError("IntegrityFailure", "Invalid native parent revision");
    return parent_hash;
  });
}

function stateAt(sql: SqlStorage, revision: string): StateNodeRef | null {
  const event = committedWorkspaceEvent(sql, revision);
  if (!event) return null;
  if (event.head === revision) return { kind: "event", eventId: event.eventId };
  const applicationId = workspaceApplicationsAt(sql, revision, event.head).at(-1);
  if (!applicationId) return null;
  const application = { kind: "application" as const, applicationId };
  return workspaceCommitForRef(sql, revision, application) === revision ? application : null;
}

export function eventLineageAt(sql: SqlStorage, revision: string) {
  const [first, second, extra] = parentsAt(sql, revision);
  if (!first || extra) throw new SemanticVcsError("IntegrityFailure", "Workspace event has invalid native parents");
  const previous = committedWorkspaceEvent(sql, first);
  const applicationIds = previous ? workspaceApplicationsAt(sql, first, previous.head) : [];
  const integrated = second ? committedWorkspaceEvent(sql, second) : null;
  if (second && integrated?.head !== second) {
    throw new SemanticVcsError("IntegrityFailure", "Replayed workspace integration has no exact saved parent");
  }
  const sources = integrated ? [integrated.eventId]
    : previous ? workspaceMergeSourcesAt(sql, first, previous.head, applicationIds).eventIds : [];
  const parents = [...new Set([...(previous ? [previous.eventId] : []), ...sources])];
  return { parents, applicationIds };
}

export function readPublishedCommitMemory(sql: SqlStorage, revision: string, eventId: string) {
  const event = sql.exec(
    "SELECT kind, message, created_at FROM dolt_at_events(?) WHERE event_id = ?", revision, eventId,
  ).toArray()[0];
  if (!event || typeof event["created_at"] !== "string")
    throw new SemanticVcsError("IntegrityFailure", "Published workspace event has no commit memory source");
  if (event["kind"] === "genesis") return null;
  const { applicationIds } = eventLineageAt(sql, revision);
  const summaries = sql.exec(
    `SELECT substr(trim(work.intent_summary), 1, 8000) AS summary
       FROM json_each(?2) AS selected
       JOIN dolt_at_applications(?1) AS app ON app.application_id = selected.value
       JOIN dolt_at_gad_work_units(?1) AS work USING (work_unit_id)
      WHERE trim(work.intent_summary) <> ''
      ORDER BY CAST(selected.key AS INTEGER)
      LIMIT 64`,
    revision, JSON.stringify(applicationIds),
  ).toArray();
  const text = [...new Set([event["message"], ...summaries.map((row) => row["summary"])]
    .flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : []))]
    .join("\n").slice(0, 64_000);
  return text ? { eventId, revision, text, createdAt: event["created_at"] } : null;
}

/** One bounded page of commits newly reachable at an immutable protected tip. */
export function readPublishedCommitMemoryPage(
  sql: SqlStorage,
  revision: string,
  previousRevision: string | null,
  after: string | null,
) {
  const size = 16;
  const rows = previousRevision === null
    ? sql.exec(
        `SELECT event_id FROM dolt_at_events(?1)
          WHERE kind <> 'genesis' AND event_id > ?2
          ORDER BY event_id LIMIT ?3`,
        revision, after ?? "", size + 1,
      ).toArray()
    : sql.exec(
        `SELECT diff.to_event_id AS event_id FROM dolt_diff_events(?1, ?2) AS diff
          JOIN dolt_at_events(?2) AS event ON event.event_id = diff.to_event_id
          WHERE diff.diff_type = 'added' AND event.kind <> 'genesis' AND diff.to_event_id > ?3
          ORDER BY diff.to_event_id LIMIT ?4`,
        previousRevision, revision, after ?? "", size + 1,
      ).toArray();
  const eventIds = rows.slice(0, size).map(({ event_id }) => {
    if (typeof event_id !== "string" || !event_id)
      throw new SemanticVcsError("IntegrityFailure", "Invalid published workspace event");
    return event_id;
  });
  const documents = eventIds.flatMap((eventId) => {
    const ref = { kind: "event" as const, eventId };
    const at = workspaceCommitForRef(sql, revision, ref);
    if (!at) throw new SemanticVcsError("IntegrityFailure", "Published memory event is outside its snapshot");
    const memory = readPublishedCommitMemory(sql, at, eventId);
    return memory ? [memory] : [];
  });
  return { documents, nextAfter: rows.length > size ? eventIds.at(-1)! : null };
}

function inspectEvent(sql: SqlStorage, revision: string, workspaceId: string, eventId: string) {
  const row = sql.exec(
    "SELECT * FROM dolt_at_events(?) WHERE event_id = ?", revision, eventId,
  ).toArray()[0];
  if (!row) throw new SemanticVcsError("InvalidReference", "Unknown workspace event");
  const { parents, applicationIds } = eventLineageAt(sql, revision);
  const decisions = applicationIds.length > 0 ? sql.exec(
    `SELECT decisions.decision_id FROM json_each(?2) AS selected
      JOIN dolt_at_applications(?1) AS app ON app.application_id = selected.value
      JOIN dolt_at_gad_integration_decisions(?1) AS decisions USING (work_unit_id)
      ORDER BY CAST(selected.key AS INTEGER), decisions.decision_id`,
    revision, JSON.stringify(applicationIds),
  ).toArray().map(({ decision_id }) => decision_id) : [];
  const deltas = sql.exec(
    `SELECT delta_id FROM dolt_at_gad_workspace_event_external_sources(?)
      WHERE event_id = ? ORDER BY ordinal`,
    revision, eventId,
  ).toArray().map(({ delta_id }) => delta_id);
  return vcsWorkspaceEventSchema.parse({
    eventId, workspaceId, revision, kind: row["kind"], commandId: row["command_id"],
    snapshotSource: typeof row["snapshot_source"] === "string" ? JSON.parse(row["snapshot_source"]) : null,
    parentEventIds: parents, applicationIds, decisionIds: decisions, externalDeltaIds: deltas,
    message: row["message"], createdAt: row["created_at"], semanticProtocol: SEMANTIC_PROTOCOL,
  });
}

export function workspaceApplicationBasis(sql: SqlStorage, revision: string) {
  const [parent] = parentsAt(sql, revision);
  const basis = parent ? stateAt(sql, parent) : null;
  if (!basis) throw new SemanticVcsError("IntegrityFailure", "Workspace application has no exact native basis");
  return basis;
}

function inspectApplication(sql: SqlStorage, revision: string, applicationId: string) {
  const row = sql.exec(
    "SELECT * FROM dolt_at_applications(?) WHERE application_id = ?", revision, applicationId,
  ).toArray()[0];
  if (!row) throw new SemanticVcsError("InvalidReference", "Unknown workspace application");
  const basis = workspaceApplicationBasis(sql, revision);
  const appliedChanges = readAppliedChanges(sql, revision, "application_id", applicationId, 200);
  const count = sql.exec(
    "SELECT COUNT(*) AS count FROM dolt_at_gad_applied_changes(?) WHERE application_id = ?", revision, applicationId,
  ).toArray()[0]?.["count"];
  return vcsWorkApplicationSchema.parse({
    applicationId, revision, workUnitId: row["work_unit_id"], semanticProtocol: row["semantic_protocol"],
    basis, appliedChanges, appliedChangeCount: count,
  });
}

const readJson = (value: unknown): Record<string, unknown> | null =>
  typeof value === "string" ? JSON.parse(value) : null;

function readAppliedChanges(
  sql: SqlStorage,
  revision: string,
  column: "application_id" | "applied_change_id",
  id: string,
  limit: number,
) {
  return sql.exec(
    `SELECT applied.applied_change_id, applied.application_id, applied.change_id, applied.ordinal, applied.applied_base_json,
            applied.applied_result_json, authored.kind, authored.payload_json,
            (SELECT predicate_json FROM dolt_at_gad_applied_change_predicates(?1) AS predicates
              WHERE predicates.applied_change_id = applied.applied_change_id
              ORDER BY ordinal LIMIT 1) AS result_predicate
       FROM dolt_at_gad_applied_changes(?1) AS applied
       JOIN dolt_at_gad_changes(?1) AS authored USING (change_id)
      WHERE applied.${column} = ?2 ORDER BY applied.ordinal LIMIT ?3`,
    revision, id, limit,
  ).toArray().map((applied) => {
    return vcsAppliedChangeSchema.parse({
      appliedChangeId: applied["applied_change_id"], applicationId: applied["application_id"], changeId: applied["change_id"],
      ordinal: applied["ordinal"], resultPredicate: readJson(applied["result_predicate"]),
      appliedEffects: changeEffects({
        kind: String(applied["kind"]), base: readJson(applied["applied_base_json"]),
        result: readJson(applied["applied_result_json"]), payload: readJson(applied["payload_json"]) ?? {},
      }),
    });
  });
}

function inspectChange(
  sql: SqlStorage,
  at: string,
  root: Extract<VcsSemanticNodeRef, { kind: "change" }>,
  limit: number,
  edges: VcsProvenanceEdge[],
) {
  const { changeId } = root;
  const row = sql.exec(
    "SELECT * FROM dolt_at_gad_changes(?) WHERE change_id = ?", at, changeId,
  ).toArray()[0];
  if (!row || typeof row["work_unit_id"] !== "string" || typeof row["kind"] !== "string")
    throw new SemanticVcsError("InvalidReference", "Unknown authored workspace change");
  const workUnitId = row["work_unit_id"];
  const effectPayload = readJson(row["payload_json"]);
  const counters = sql.exec(
    `SELECT change_id, counteracted_change_id FROM dolt_at_gad_change_counteractions(?1)
      WHERE change_id = ?2 OR counteracted_change_id = ?2
      ORDER BY change_id, ordinal LIMIT ?3`,
    at, changeId, limit,
  ).toArray();
  const counteracts = sql.exec(
    `SELECT counteracted_change_id FROM dolt_at_gad_change_counteractions(?)
      WHERE change_id = ? ORDER BY ordinal LIMIT 200`,
    at, changeId,
  ).toArray().map(({ counteracted_change_id }) => String(counteracted_change_id));
  const change = vcsChangeSchema.parse({
    changeId, authoredByWorkUnitId: workUnitId, operation: row["operation"], kind: publicChangeKind(row["kind"]),
    effects: changeEffects({ kind: row["kind"], base: readJson(row["base_json"]), result: readJson(row["result_json"]), payload: effectPayload ?? {} }),
    counteractsChangeIds: counteracts, effectDigest: row["effect_digest"], normalizationProtocol: NORMALIZATION_PROTOCOL,
  });
  edges.push({ kind: "authored-change", from: { kind: "work-unit", workUnitId }, to: root });
  const copySource = readJson(row["source_json"]);
  if (copySource) {
    const origin = vcsSemanticNodeRefSchema.parse({
      kind: "file", state: copySource["state"], repositoryId: copySource["repositoryId"], fileId: copySource["fileId"],
    });
    edges.push({ kind: "authored-copy-source", from: root, to: origin });
  }
  for (const { change_id, counteracted_change_id } of counters) {
    edges.push({
      kind: "counteracts", from: { kind: "change", changeId: String(change_id) },
      to: { kind: "change", changeId: String(counteracted_change_id) },
    });
  }
  const applied = sql.exec(
    `SELECT applied_change_id FROM dolt_at_gad_applied_changes(?) WHERE change_id = ?
      ORDER BY applied_change_id LIMIT ?`,
    at, changeId, limit,
  ).toArray();
  for (const { applied_change_id } of applied) {
    edges.push({ kind: "realizes-change", from: { kind: "applied-change", appliedChangeId: String(applied_change_id) }, to: root });
  }
  const decisions = sql.exec(
    `SELECT DISTINCT decisions.decision_id, decisions.work_unit_id
       FROM dolt_at_gad_decision_source_changes(?1) AS source
       JOIN dolt_at_gad_integration_decisions(?1) AS decisions USING (decision_id)
      WHERE source.change_id = ?2 ORDER BY decisions.decision_id LIMIT ?3`,
    at, changeId, limit,
  ).toArray();
  for (const { decision_id, work_unit_id } of decisions) {
    edges.push({ kind: "decides-change", from: { kind: "decision", decisionId: String(decision_id) }, to: root });
    edges.push({ kind: "incorporates-change", from: { kind: "work-unit", workUnitId: String(work_unit_id) }, to: root });
  }
  return change;
}

function appendAppliedContentEdges(
  sql: SqlStorage,
  at: string,
  appliedChangeId: string,
  limit: number,
  edges: VcsProvenanceEdge[],
) {
  const rows = sql.exec(
    `SELECT child_applied_change_id, parent_ref_json, relation
      FROM dolt_at_gad_content_edges(?1)
     WHERE child_applied_change_id = ?2 OR json_extract(parent_ref_json, '$.appliedChangeId') = ?2
     ORDER BY content_edge_id LIMIT ?3`,
    at, appliedChangeId, limit,
  ).toArray();
  for (const { child_applied_change_id, parent_ref_json, relation } of rows) {
    const to = vcsSemanticNodeRefSchema.parse(readJson(parent_ref_json));
    if (to.kind !== "file" && to.kind !== "applied-change")
      throw new SemanticVcsError("IntegrityFailure", "Workspace content edge has an invalid parent");
    edges.push({
      kind: contentRelation(relation),
      from: { kind: "applied-change", appliedChangeId: String(child_applied_change_id) },
      to,
    });
  }
}

function contentRelation(relation: unknown) {
  switch (relation) {
    case "copies": return "copies-content";
    case "incorporates": return "incorporates-content";
    case "preserves": return "preserves-content";
    default: throw new SemanticVcsError("IntegrityFailure", "Workspace content edge has an invalid relation");
  }
}

type PlacementRef = Extract<VcsSemanticNodeRef, { kind: "file" | "repository" }>;
type PlacementIdentity =
  | { kind: "file"; fileId: string }
  | { kind: "repository"; repositoryId: string };

export function placementTombstone(sql: SqlStorage, revision: string, root: PlacementIdentity): string | null {
  const query = root.kind === "file"
    ? "SELECT tombstone_change_id FROM dolt_at_files(?) WHERE file_id = ?"
    : "SELECT tombstone_change_id FROM dolt_at_repositories(?) WHERE repository_id = ?";
  const id = root.kind === "file" ? root.fileId : root.repositoryId;
  const tombstone = sql.exec(query, revision, id).toArray()[0]?.["tombstone_change_id"];
  return typeof tombstone === "string" ? tombstone : null;
}

/** Follow the selected deletion through any saved or integrated versions that inherited it. */
export function priorPlacement(
  sql: SqlStorage, revision: string, root: PlacementIdentity, tombstoneChangeId: string,
): string {
  let edges = 0;
  for (let at = revision; edges < MAX_ANCESTRY_EDGES;) {
    const parents = parentsAt(sql, at);
    edges += parents.length;
    const [basis] = parents;
    if (!basis) throw new SemanticVcsError("IntegrityFailure", "Workspace deletion has no prior revision");
    const inherited = parents.find((parent) => placementTombstone(sql, parent, root) === tombstoneChangeId);
    if (!inherited) return basis;
    at = inherited;
  }
  throw new SemanticVcsError("ScopeTooLarge", "Workspace deletion exceeds its ancestry bound");
}

function inspectPlacement(
  sql: SqlStorage, at: string, root: PlacementRef, limit: number, edges: VcsProvenanceEdge[],
): Extract<VcsInspectResult["node"], { kind: "file" | "repository" }> {
  const { state, repositoryId } = root;
  const revision = workspaceCommitForRef(sql, at, state);
  if (!revision) throw new SemanticVcsError("InvalidReference", "Unknown workspace placement revision");
  const basis = workspaceEditBasisAt(sql, revision);
  const tombstoneChangeId = placementTombstone(sql, revision, root);
  const prior = tombstoneChangeId ? priorPlacement(sql, revision, root, tombstoneChangeId) : revision;
  if (root.kind === "repository") {
    const repository = workspaceTransferBasisAt(sql, prior).presentRepository(repositoryId);
    edges.push({ kind: "contains-repository", from: state, to: root });
    return {
      kind: "repository", state,
      value: vcsRepositoryStateSchema.parse(tombstoneChangeId
        ? { kind: "tombstone", repositoryId, priorPresentStateId: repository.repositoryStateId, tombstoneChangeId }
        : { kind: "present", repositoryId, repoPath: repository.repoPath, manifestId: repository.fileManifestId }),
    };
  }

  const { fileId } = root;
  const file = (tombstoneChangeId ? workspaceEditBasisAt(sql, prior) : basis).file(fileId);
  if (!file || file.repositoryId !== repositoryId)
    throw new SemanticVcsError("InvalidReference", "File is outside the requested workspace repository");
  const { fileStateId, presence: _presence, ...placed } = file;
  if (!tombstoneChangeId) edges.push({ kind: "places-file", from: state, to: root });
  const copies = sql.exec(
    `SELECT change_id FROM dolt_at_gad_changes(?)
      WHERE json_extract(source_json, '$.state') = ?
        AND json_extract(source_json, '$.repositoryId') = ?
        AND json_extract(source_json, '$.fileId') = ?
      ORDER BY change_id LIMIT ?`,
    at, canonicalJson(state), repositoryId, fileId, limit,
  ).toArray();
  for (const { change_id } of copies) {
    edges.push({ kind: "authored-copy-source", from: { kind: "change", changeId: String(change_id) }, to: root });
  }
  const content = sql.exec(
    `SELECT child_applied_change_id, relation FROM dolt_at_gad_content_edges(?)
      WHERE parent_ref_json = ? ORDER BY content_edge_id LIMIT ?`,
    at, canonicalJson(root), limit,
  ).toArray();
  for (const { child_applied_change_id, relation } of content) {
    edges.push({
      kind: contentRelation(relation),
      from: { kind: "applied-change", appliedChangeId: String(child_applied_change_id) },
      to: root,
    });
  }
  return {
    kind: "file", state,
    value: vcsFileStateSchema.parse(tombstoneChangeId
      ? { kind: "tombstone", fileId, priorPlacedStateId: fileStateId, tombstoneChangeId }
      : { kind: "placed", ...placed }),
  };
}

function inspectDecision(
  sql: SqlStorage,
  at: string,
  root: Extract<VcsSemanticNodeRef, { kind: "decision" }>,
  limit: number,
  edges: VcsProvenanceEdge[],
) {
  const { decisionId } = root;
  const decision = sql.exec(
    "SELECT * FROM dolt_at_gad_integration_decisions(?) WHERE decision_id = ?",
    at, decisionId,
  ).toArray()[0];
  if (!decision) throw new SemanticVcsError("InvalidReference", "Unknown workspace integration decision");
  const workUnitId = String(decision["work_unit_id"]);
  const intentOf = (id: string) => {
    const row = sql.exec(
      "SELECT kind, intent_summary, trigger_excerpt, trigger_sender_json FROM dolt_at_gad_work_units(?) WHERE work_unit_id = ?",
      at, id,
    ).toArray()[0];
    if (!row || typeof row["kind"] !== "string")
      throw new SemanticVcsError("IntegrityFailure", "Workspace integration decision has missing intent evidence");
    return readHistoryWorkIntent(sql, at, id, row["kind"], row["intent_summary"], row["trigger_excerpt"], row["trigger_sender_json"]);
  };
  const entries = sql.exec(
    `SELECT coordinate_kind, coordinate_id, resolution, result_change_id, rationale
       FROM dolt_at_gad_merge_decision_entries(?)
      WHERE decision_id = ? ORDER BY coordinate_kind, coordinate_id LIMIT 500`,
    at, decisionId,
  ).toArray().map((entry) => ({
    coordinate: { kind: entry["coordinate_kind"], id: entry["coordinate_id"] },
    resolution: entry["resolution"],
    accountedSourceChangeIds: sql.exec(
      `SELECT change_id FROM dolt_at_gad_decision_source_changes(?)
        WHERE decision_id = ? AND coordinate_kind = ? AND coordinate_id = ? ORDER BY change_id LIMIT 10000`,
      at, decisionId, entry["coordinate_kind"], entry["coordinate_id"],
    ).toArray().map(({ change_id }) => change_id),
    resultChangeId: entry["result_change_id"] ?? undefined,
    rationale: entry["rationale"] ?? undefined,
  }));
  const sourceIntents = sql.exec(
    `SELECT DISTINCT authored.work_unit_id
       FROM dolt_at_gad_decision_source_changes(?1) AS source
       JOIN dolt_at_gad_changes(?1) AS authored USING (change_id)
      WHERE source.decision_id = ?2 ORDER BY authored.work_unit_id LIMIT 500`,
    at, decisionId,
  ).toArray().map(({ work_unit_id }) => ({
    workUnitId: work_unit_id,
    intent: intentOf(String(work_unit_id)),
  }));
  edges.push({ kind: "records-decision", from: { kind: "work-unit", workUnitId }, to: root });
  const sources = sql.exec(
    `SELECT DISTINCT change_id FROM dolt_at_gad_decision_source_changes(?)
      WHERE decision_id = ? ORDER BY change_id LIMIT ?`,
    at, decisionId, limit,
  ).toArray();
  for (const { change_id } of sources) {
    edges.push({ kind: "decides-change", from: root, to: { kind: "change", changeId: String(change_id) } });
  }
  return vcsIntegrationDecisionSchema.parse({
    decisionId,
    intent: intentOf(workUnitId),
    sourceIntents,
    sourceState: decision["source_delta_id"] === null
      ? { kind: "event", eventId: decision["source_event_id"] }
      : { kind: "external-delta", deltaId: decision["source_delta_id"] },
    targetBasis: decision["target_state_kind"] === "event"
      ? { kind: "event", eventId: decision["target_state_id"] }
      : { kind: "application", applicationId: decision["target_state_id"] },
    entries,
  });
}

/** Follow only native parents of the admitted tip, including after a remote fetch. */
function appendStateBacklinks(
  sql: SqlStorage,
  at: string,
  revision: string,
  root: StateNodeRef,
  limit: number,
  edges: VcsProvenanceEdge[],
) {
  if (at === revision || edges.length >= limit) return;
  const children = new Map<string, Array<{ head: string; first: boolean }>>();
  const pending = [at];
  const seen = new Set<string>();
  let visitedEdges = 0;
  while (pending.length > 0) {
    const head = pending.pop()!;
    if (head === revision || seen.has(head)) continue;
    seen.add(head);
    const parents = parentsAt(sql, head);
    visitedEdges += parents.length;
    if (visitedEdges > MAX_ANCESTRY_EDGES) {
      throw new SemanticVcsError("ScopeTooLarge", "Workspace provenance exceeds its ancestry bound");
    }
    for (const [index, parent] of parents.entries()) {
      const direct = children.get(parent) ?? [];
      direct.push({ head, first: index === 0 });
      children.set(parent, direct);
      pending.push(parent);
    }
  }

  const queue = (children.get(revision) ?? [])
    .filter(({ first }) => first || root.kind === "event")
    .map(({ head, first }) => ({ head, isBasis: first }));
  const followed = new Set<string>();
  for (const { head, isBasis } of queue) {
    if (edges.length >= limit) return;
    if (followed.has(head)) continue;
    followed.add(head);
    const node = stateAt(sql, head);
    if (node?.kind === "event") {
      edges.push({
        kind: root.kind === "event" ? "parent-event" : "committed-by",
        from: node, to: root,
      });
      continue;
    }
    if (isBasis && node?.kind === "application") edges.push({ kind: "basis-state", from: node, to: root });
    for (const child of children.get(head) ?? []) {
      if (child.first) queue.push({ head: child.head, isBasis: false });
    }
  }
}

function appendPlacementEdges(sql: SqlStorage, revision: string, root: StateNodeRef, limit: number, edges: VcsProvenanceEdge[]) {
  const repos = sql.exec(
    "SELECT repository_id FROM dolt_at_repositories(?) WHERE presence = 'present' ORDER BY repository_id LIMIT ?",
    revision, limit,
  ).toArray();
  for (const { repository_id } of repos) {
    if (typeof repository_id !== "string") throw new SemanticVcsError("IntegrityFailure", "Invalid repository provenance");
    edges.push({
      kind: "contains-repository", from: root,
      to: { kind: "repository", state: root, repositoryId: repository_id },
    });
  }
  const files = sql.exec(
    "SELECT repository_id, file_id FROM dolt_at_files(?) WHERE presence = 'placed' ORDER BY file_id LIMIT ?",
    revision, limit,
  ).toArray();
  for (const { repository_id, file_id } of files) {
    if (typeof repository_id !== "string" || typeof file_id !== "string")
      throw new SemanticVcsError("IntegrityFailure", "Invalid file provenance");
    edges.push({
      kind: "places-file", from: root,
      to: { kind: "file", state: root, repositoryId: repository_id, fileId: file_id },
    });
  }
}

/** Inspect immutable, versioned provenance at one already-admitted history tip. */
export function inspectWorkspaceProvenance(
  sql: SqlStorage,
  at: string,
  workspaceId: string,
  root: VcsSemanticNodeRef,
  edgeLimit: number,
): VcsInspectResult {
  const edges: VcsProvenanceEdge[] = [];
  let node: VcsInspectResult["node"];
  if (root.kind === "event" || root.kind === "application") {
    const revision = workspaceCommitForRef(sql, at, root);
    if (!revision) throw new SemanticVcsError("InvalidReference", "Unknown workspace state");
    if (root.kind === "event") {
      const value = inspectEvent(sql, revision, workspaceId, root.eventId);
      node = { kind: "event", value };
      edges.push({ kind: "caused-by", from: root, to: { kind: "command", commandId: value.commandId } });
      for (const eventId of value.parentEventIds)
        edges.push({ kind: "parent-event", from: root, to: { kind: "event", eventId } });
      for (const applicationId of value.applicationIds)
        edges.push({ kind: "committed-by", from: root, to: { kind: "application", applicationId } });
    } else {
      const value = inspectApplication(sql, revision, root.applicationId);
      node = { kind: "application", value };
      edges.push({ kind: "basis-state", from: root, to: value.basis });
      edges.push({ kind: "applies-work", from: root, to: { kind: "work-unit", workUnitId: value.workUnitId } });
      const applied = sql.exec(
        `SELECT applied_change_id FROM dolt_at_gad_applied_changes(?)
          WHERE application_id = ? ORDER BY ordinal LIMIT ?`,
        revision, root.applicationId, edgeLimit + 1,
      ).toArray();
      for (const { applied_change_id: appliedChangeId } of applied) {
        if (typeof appliedChangeId !== "string")
          throw new SemanticVcsError("IntegrityFailure", "Invalid applied workspace provenance");
        edges.push({ kind: "applies-change", from: root, to: { kind: "applied-change", appliedChangeId } });
      }
    }
    appendStateBacklinks(sql, at, revision, root, edgeLimit + 1, edges);
    appendPlacementEdges(sql, revision, root, edgeLimit + 1, edges);
  } else if (root.kind === "applied-change") {
    const value = readAppliedChanges(sql, at, "applied_change_id", root.appliedChangeId, 1)[0];
    if (!value) throw new SemanticVcsError("InvalidReference", "Unknown applied workspace change");
    node = { kind: "applied-change", value };
    edges.push({ kind: "applies-change", from: { kind: "application", applicationId: value.applicationId }, to: root });
    edges.push({ kind: "realizes-change", from: root, to: { kind: "change", changeId: value.changeId } });
    appendAppliedContentEdges(sql, at, root.appliedChangeId, edgeLimit + 1, edges);
  } else if (root.kind === "change") {
    node = { kind: "change", value: inspectChange(sql, at, root, edgeLimit + 1, edges) };
  } else if (root.kind === "external-delta") {
    const row = sql.exec(
      `SELECT delta.*, work.work_unit_id AS authored
         FROM dolt_at_gad_external_deltas(?1) AS delta
         LEFT JOIN dolt_at_gad_work_units(?1) AS work USING (work_unit_id)
        WHERE delta.delta_id = ?2`,
      at, root.deltaId,
    ).toArray()[0];
    if (!row) throw new SemanticVcsError("InvalidReference", "Unknown workspace external delta");
    const workUnitId = row["work_unit_id"];
    if (typeof workUnitId !== "string" || row["authored"] !== workUnitId)
      throw new SemanticVcsError("IntegrityFailure", "Workspace external delta is missing its authored work");
    const changeCount = Number(sql.exec(
      "SELECT COUNT(*) AS total FROM dolt_at_gad_changes(?) WHERE work_unit_id = ?", at, workUnitId,
    ).one()["total"]);
    const changeIds = sql.exec(
      `SELECT change_id FROM dolt_at_gad_changes(?) WHERE work_unit_id = ?
        ORDER BY operation, ordinal, change_id LIMIT 200`,
      at, workUnitId,
    ).toArray().map(({ change_id }) => change_id);
    node = {
      kind: "external-delta",
      value: vcsExternalDeltaResultSchema.parse({
        deltaId: root.deltaId, workUnitId, changeCount, changeIds,
        repositoryId: row["repository_id"], repoPath: row["repo_path"],
        oldSnapshot: row["old_snapshot"], newSnapshot: row["new_snapshot"], status: row["status"],
      }),
    };
  } else if (root.kind === "decision") {
    node = { kind: "decision", value: inspectDecision(sql, at, root, edgeLimit + 1, edges) };
  } else if (root.kind === "file" || root.kind === "repository") {
    node = inspectPlacement(sql, at, root, edgeLimit + 1, edges);
  } else if (root.kind === "work-unit") {
    const { workUnitId } = root;
    const row = sql.exec(
      "SELECT * FROM dolt_at_gad_work_units(?) WHERE work_unit_id = ?", at, workUnitId,
    ).toArray()[0];
    if (!row || typeof row["kind"] !== "string") throw new SemanticVcsError("InvalidReference", "Unknown workspace work unit");
    const commandId = row["command_id"];
    if (typeof commandId !== "string") throw new SemanticVcsError("IntegrityFailure", "Work unit has no originating command");
    const ids = (query: string, limit?: number) => sql.exec(
      query, at, workUnitId, ...(limit === undefined ? [] : [limit]),
    ).toArray().map(({ id }) => {
      if (typeof id !== "string") throw new SemanticVcsError("IntegrityFailure", "Work unit has an invalid provenance identity");
      return id;
    });
    const count = (query: string) => Number(sql.exec(query, at, workUnitId).toArray()[0]?.["count"]);
    const authored = ids(
      `SELECT change_id AS id FROM dolt_at_gad_changes(?1) WHERE work_unit_id = ?2
         ORDER BY operation, ordinal, change_id LIMIT ?3`,
      Math.max(200, edgeLimit + 1),
    );
    const incorporated = ids(
      `SELECT sources.change_id AS id FROM dolt_at_gad_integration_decisions(?1) AS decisions
        JOIN dolt_at_gad_decision_source_changes(?1) AS sources USING (decision_id)
       WHERE decisions.work_unit_id = ?2 ORDER BY sources.change_id LIMIT ?3`,
      Math.max(200, edgeLimit + 1),
    );
    const decisions = ids(
      `SELECT decision_id AS id FROM dolt_at_gad_integration_decisions(?1) WHERE work_unit_id = ?2
         ORDER BY created_at, decision_id LIMIT ?3`,
      Math.max(200, edgeLimit + 1),
    );
    const applications = ids(
      "SELECT application_id AS id FROM dolt_at_applications(?1) WHERE work_unit_id = ?2 ORDER BY application_id LIMIT ?3",
      edgeLimit + 1,
    );
    const triggerEvidence = typeof row["trigger_excerpt"] === "string" && typeof row["trigger_sender_json"] === "string"
      ? { text: row["trigger_excerpt"], sender: JSON.parse(row["trigger_sender_json"]) }
      : null;
    const externalSnapshot = typeof row["external_snapshot_json"] === "string" ? JSON.parse(row["external_snapshot_json"]) : null;
    const intent = readHistoryWorkIntent(
      sql, at, workUnitId, row["kind"], row["intent_summary"], row["trigger_excerpt"], row["trigger_sender_json"],
    );
    node = {
      kind: "work-unit",
      value: vcsWorkUnitSchema.parse({
        workUnitId, commandId, kind: row["kind"],
        authoredChangeCount: count("SELECT COUNT(*) AS count FROM dolt_at_gad_changes(?1) WHERE work_unit_id = ?2"),
        authoredChangeIds: authored.slice(0, 200),
        incorporatedChangeCount: count(
          `SELECT COUNT(*) AS count FROM dolt_at_gad_integration_decisions(?1) AS decisions
             JOIN dolt_at_gad_decision_source_changes(?1) AS sources USING (decision_id)
            WHERE decisions.work_unit_id = ?2`,
        ),
        incorporatedChangeIds: incorporated.slice(0, 200),
        decisionCount: count("SELECT COUNT(*) AS count FROM dolt_at_gad_integration_decisions(?1) WHERE work_unit_id = ?2"),
        decisionIds: decisions.slice(0, 200),
        intent, intentSummary: row["intent_summary"],
        authorContextId: row["author_context_id"], triggerEvidence, externalSnapshot,
        contentClass: row["content_class"], externalKeys: JSON.parse(String(row["external_lineage_json"])),
        normalizationProtocol: row["normalization_protocol"], createdAt: row["created_at"],
      }),
    };
    edges.push({ kind: "caused-by", from: root, to: { kind: "command", commandId } });
    for (const applicationId of applications)
      edges.push({ kind: "applies-work", from: { kind: "application", applicationId }, to: root });
    for (const changeId of authored)
      edges.push({ kind: "authored-change", from: root, to: { kind: "change", changeId } });
    for (const changeId of incorporated)
      edges.push({ kind: "incorporates-change", from: root, to: { kind: "change", changeId } });
    for (const decisionId of decisions)
      edges.push({ kind: "records-decision", from: root, to: { kind: "decision", decisionId } });
  } else if (root.kind === "command") {
    const { commandId } = root;
    const row = sql.exec(
      "SELECT * FROM dolt_at_commands(?) WHERE command_id = ?", at, commandId,
    ).toArray()[0];
    if (!row || typeof row["method"] !== "string" || typeof row["created_at"] !== "string")
      throw new SemanticVcsError("InvalidReference", "Unknown workspace command");
    const results = sql.exec(
      `SELECT 'work-unit' AS kind, work_unit_id AS id FROM dolt_at_gad_work_units(?1) WHERE command_id = ?2
       UNION ALL
       SELECT 'event', event_id FROM dolt_at_events(?1) WHERE command_id = ?2 ORDER BY kind DESC, id LIMIT ?3`,
      at, commandId, edgeLimit + 1,
    ).toArray().map(({ kind, id }): VcsSemanticNodeRef => {
      if (typeof id !== "string") throw new SemanticVcsError("IntegrityFailure", "Workspace command has an invalid result");
      return kind === "work-unit" ? { kind, workUnitId: id } : { kind: "event", eventId: id };
    });
    const { cause_log_id, cause_head, cause_invocation_id } = row;
    if (typeof cause_log_id === "string" && typeof cause_head === "string" && typeof cause_invocation_id === "string") {
      edges.push({
        kind: "caused-by",
        from: root,
        to: { kind: "trajectory-invocation", logId: cause_log_id, head: cause_head, invocationId: cause_invocation_id },
      });
    }
    for (const result of results) edges.push({ kind: "caused-by", from: result, to: root });
    node = {
      kind: "command",
      value: {
        commandId, workspaceId,
        contextId: row["scope_kind"] === "context" && typeof row["scope_id"] === "string" ? row["scope_id"] : null,
        method: row["method"], status: "complete", result: results[0] ?? null,
        createdAt: row["created_at"], completedAt: row["created_at"],
      },
    };
  } else {
    throw new SemanticVcsError("InvalidReference", "Workspace history does not yet inspect this kind of node");
  }
  return { root, node, edges: edges.slice(0, edgeLimit), hasMoreEdges: edges.length > edgeLimit };
}

export function workspaceProvenanceNeighbors(
  sql: SqlStorage, at: string, workspaceId: string, contextId: string, input: VcsNeighborsInput,
): VcsNeighborsResult {
  const { root, cursor, limit } = input;
  const basis = { workspaceId, contextId, at, root };
  const position = parseSemanticCursor(cursor, "native-neighbors", basis);
  const offset = position ? position["offset"] : 0;
  if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0 || offset > MAX_ANCESTRY_EDGES) {
    throw new SemanticVcsError("InvalidReference", "Workspace neighbor cursor has an invalid position");
  }
  const end = Math.min(offset + limit, MAX_ANCESTRY_EDGES);
  const { edges, hasMoreEdges } = inspectWorkspaceProvenance(sql, at, workspaceId, root, end);
  if (hasMoreEdges && end === MAX_ANCESTRY_EDGES) {
    throw new SemanticVcsError("ScopeTooLarge", "Workspace provenance exceeds its adjacency bound");
  }
  return {
    root,
    edges: edges.slice(offset, end),
    nextCursor: hasMoreEdges ? semanticCursor("native-neighbors", basis, { offset: end }) : null,
  };
}

type EventHistoryInput = Extract<VcsHistoryInput, { root: { kind: "event" } }>;
type FileHistoryInput = Extract<VcsHistoryInput, { root: { kind: "file" } }>;
type SavedEvent = { eventId: string; head: string };

/** Traverse semantic events at exact native commits, including saved merge parents. */
export function workspaceEventHistory(
  sql: SqlStorage, tips: readonly string[], workspaceId: string, contextId: string,
  input: EventHistoryInput,
): VcsHistoryResult {
  const { root, direction, cursor, limit } = input;
  const rootHead = tips.map((tip) => workspaceCommitForRef(sql, tip, root)).find((head) => head !== null);
  if (!rootHead) throw new SemanticVcsError("InvalidReference", "Workspace event is outside the admitted history");
  const basis = { workspaceId, contextId, tips, root, direction };
  const after = parseSemanticCursor(cursor, "native-event-history", basis);
  const afterDepth = after ? after["depth"] : 0;
  const afterId = after ? after["eventId"] : null;
  if (typeof afterDepth !== "number" || !Number.isSafeInteger(afterDepth) || afterDepth < 0 ||
      afterDepth > MAX_ANCESTRY_EDGES || (after && typeof afterId !== "string")) {
    throw new SemanticVcsError("InvalidReference", "Workspace history cursor has an invalid position");
  }

  const parents = new Map<string, SavedEvent[]>();
  let edges = 0;
  const parentsOf = (event: SavedEvent): SavedEvent[] => {
    const cached = parents.get(event.eventId);
    if (cached) return cached;
    const direct = eventLineageAt(sql, event.head).parents.map((eventId) => {
      const head = workspaceCommitForRef(sql, event.head, { kind: "event", eventId });
      if (!head) throw new SemanticVcsError("IntegrityFailure", "Workspace event parent has no native revision");
      return { eventId, head };
    });
    edges += direct.length;
    if (edges > MAX_ANCESTRY_EDGES)
      throw new SemanticVcsError("ScopeTooLarge", "Workspace event history exceeds its ancestry bound");
    parents.set(event.eventId, direct);
    return direct;
  };
  const children = new Map<string, SavedEvent[]>();
  if (direction === "future") {
    const pending = tips.map((tip) => committedWorkspaceEvent(sql, tip)).filter((event) => event !== null);
    const seen = new Set<string>();
    for (const event of pending) {
      if (seen.has(event.eventId)) continue;
      seen.add(event.eventId);
      for (const parent of parentsOf(event)) {
        const sibling = children.get(parent.eventId) ?? [];
        sibling.push(event);
        children.set(parent.eventId, sibling);
        pending.push(parent);
      }
    }
  }

  const positioned: Array<{ event: SavedEvent; depth: number }> = [];
  let layer: SavedEvent[] = [{ eventId: root.eventId, head: rootHead }];
  const visited = new Set([root.eventId]);
  for (let depth = 0; layer.length > 0 && positioned.length <= limit; depth++) {
    const next: SavedEvent[] = [];
    layer.sort((a, b) => compareUtf16CodeUnits(a.eventId, b.eventId));
    for (const event of layer) {
      if (depth > afterDepth || (depth === afterDepth && typeof afterId === "string" &&
          compareUtf16CodeUnits(event.eventId, afterId) > 0)) {
        positioned.push({ event, depth });
        if (positioned.length > limit) break;
      }
      const relatives = direction === "past" ? parentsOf(event) : children.get(event.eventId) ?? [];
      for (const relative of relatives) {
        if (visited.has(relative.eventId)) continue;
        visited.add(relative.eventId);
        next.push(relative);
      }
    }
    layer = next;
  }
  const page = positioned.slice(0, limit);
  const entries = page.map(({ event }) => {
    const row = sql.exec(
      "SELECT created_at, message, kind FROM dolt_at_events(?) WHERE event_id = ?", event.head, event.eventId,
    ).toArray()[0];
    if (!row || typeof row["created_at"] !== "string" || typeof row["kind"] !== "string")
      throw new SemanticVcsError("IntegrityFailure", "Workspace history event is incomplete");
    return {
      node: { kind: "event" as const, eventId: event.eventId },
      createdAt: row["created_at"],
      summary: typeof row["message"] === "string" && row["message"] ? row["message"] : row["kind"],
    };
  });
  const last = page.at(-1);
  return {
    root, entries,
    nextCursor: last && positioned.length > limit
      ? semanticCursor("native-event-history", basis, { depth: last.depth, eventId: last.event.eventId })
      : null,
  };
}

/** Follow the applications that affected a stable file at its selected revision. */
export function workspaceFileHistory(
  sql: SqlStorage, at: string, workspaceId: string, contextId: string,
  input: FileHistoryInput,
): VcsHistoryResult {
  return workspaceFileHistoryWithOrigin(sql, at, workspaceId, contextId, input).history;
}

export function workspaceFileHistoryWithOrigin(
  sql: SqlStorage, at: string, workspaceId: string, contextId: string,
  input: FileHistoryInput,
): { history: VcsHistoryResult; firstAppliedChangeId: string | null } {
  const { root, limit, cursor } = input;
  const revision = workspaceCommitForRef(sql, at, root.state);
  if (!revision) throw new SemanticVcsError("InvalidReference", "Unknown workspace file revision");
  const tombstone = placementTombstone(sql, revision, root);
  const placedAt = tombstone ? priorPlacement(sql, revision, root, tombstone) : revision;
  const file = workspaceEditBasisAt(sql, placedAt).file(root.fileId);
  if (!file || file.repositoryId !== root.repositoryId)
    throw new SemanticVcsError("InvalidReference", "File is outside the requested workspace repository");

  const basis = { workspaceId, contextId, revision, root };
  const position = parseSemanticCursor(cursor, "native-file-history", basis);
  const offset = position ? position["offset"] : 0;
  if (typeof offset !== "number" || !Number.isSafeInteger(offset) ||
      offset < 0 || offset > MAX_ANCESTRY_EDGES) {
    throw new SemanticVcsError("InvalidReference", "Workspace file history cursor has an invalid position");
  }
  const entries: VcsHistoryResult["entries"] = [];
  let firstAppliedChangeId: string | null = null;
  const seenCommits = new Set([revision]);
  const seenChanges = new Set<string>();
  const pending = [revision];
  for (const commit of pending) {
    if (entries.length > limit) break;
    const [ours, theirs, extra] = parentsAt(sql, commit);
    if (!ours) continue;
    if (extra) throw new SemanticVcsError("IntegrityFailure", "Workspace file history has too many parents");
    const rows = sql.exec(
      `WITH introduced AS MATERIALIZED (
         SELECT to_application_id AS application_id, to_work_unit_id AS work_unit_id
           FROM dolt_diff_applications(?2, ?1) AS diff
          WHERE diff_type = 'added'
            AND (?3 IS NULL OR NOT EXISTS (
              SELECT 1 FROM dolt_at_applications(?3) AS incoming
               WHERE incoming.application_id = diff.to_application_id
            ))
       ), selected_decision AS (
         SELECT decision.decision_id
           FROM introduced
           JOIN dolt_at_gad_integration_decisions(?1) AS decision USING (work_unit_id)
           JOIN dolt_at_gad_merge_decision_entries(?1) AS entry USING (decision_id)
          WHERE entry.coordinate_kind = 'file' AND entry.coordinate_id = ?4 AND entry.resolution = 'adopt'
       ), adopted AS (
         SELECT source.change_id, selected_decision.decision_id
           FROM selected_decision JOIN dolt_at_gad_decision_source_changes(?1) AS source USING (decision_id)
          WHERE source.coordinate_kind = 'file' AND source.coordinate_id = ?4
       ), applied_here AS (
         SELECT applied.change_id, applied.ordinal, applied.applied_change_id
           FROM introduced JOIN dolt_at_gad_applied_changes(?1) AS applied USING (application_id)
          WHERE EXISTS (SELECT 1 FROM dolt_at_gad_change_coordinates(?1) AS target
                         WHERE target.change_id = applied.change_id AND target.file_id = ?4)
       ), candidates AS (
         SELECT applied_here.change_id, applied_here.ordinal, applied_here.applied_change_id, adopted.decision_id AS via_decision_id
           FROM applied_here LEFT JOIN adopted USING (change_id)
         UNION ALL
         SELECT change_id, -1, NULL, decision_id FROM adopted
          WHERE NOT EXISTS (SELECT 1 FROM applied_here WHERE applied_here.change_id = adopted.change_id)
       )
       SELECT change.change_id, change.kind, change.work_unit_id, work.created_at, candidate.applied_change_id, candidate.via_decision_id
         FROM candidates AS candidate
         JOIN dolt_at_gad_changes(?1) AS change USING (change_id)
         JOIN dolt_at_gad_work_units(?1) AS work USING (work_unit_id)
        ORDER BY candidate.ordinal DESC, work.created_at DESC, change.change_id, candidate.via_decision_id
        LIMIT ?5`,
      commit, ours, theirs ?? null, root.fileId, MAX_ANCESTRY_EDGES + 1,
    ).toArray();
    for (const row of rows) {
      const { change_id, kind, work_unit_id, created_at, applied_change_id, via_decision_id } = row;
      if (typeof change_id !== "string" || typeof kind !== "string" ||
          typeof work_unit_id !== "string" || typeof created_at !== "string") {
        throw new SemanticVcsError("IntegrityFailure", "Workspace file history has an incomplete applied change");
      }
      if (seenChanges.has(change_id)) continue;
      seenChanges.add(change_id);
      if (seenChanges.size > MAX_ANCESTRY_EDGES)
        throw new SemanticVcsError("ScopeTooLarge", "Workspace file history exceeds its change bound");
      if (seenChanges.size <= offset) continue;
      if (!entries.length && typeof applied_change_id === "string") firstAppliedChangeId = applied_change_id;
      entries.push({
        node: { kind: "change", changeId: change_id },
        createdAt: created_at,
        summary: kind,
        intent: readHistoryWorkUnitIntent(sql, commit, work_unit_id),
        ...(typeof via_decision_id === "string" ? { viaDecisionId: via_decision_id } : {}),
      });
      if (entries.length > limit) break;
    }
    const parents = [ours];
    // A clean adoption can change the file without introducing an applied change.
    // Include the source only when its exact placement or content was retained.
    if (theirs && rows.length === 0 &&
        placementMergeParents(sql, { hash: commit, ours, theirs }, [root.fileId])[0]?.[1] === theirs) {
      parents.push(theirs);
    }
    for (const parent of parents) {
      if (seenCommits.has(parent)) continue;
      seenCommits.add(parent);
      if (seenCommits.size > MAX_ANCESTRY_EDGES)
        throw new SemanticVcsError("ScopeTooLarge", "Workspace file history exceeds its ancestry bound");
      pending.push(parent);
    }
  }
  return {
    firstAppliedChangeId,
    history: {
      root, entries: entries.slice(0, limit),
      nextCursor: entries.length > limit
        ? semanticCursor("native-file-history", basis, { offset: offset + limit })
        : null,
    },
  };
}
