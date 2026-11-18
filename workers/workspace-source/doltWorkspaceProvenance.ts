import type { SqlStorage } from "@vibestudio/durable";
import {
  vcsAppliedChangeSchema,
  vcsChangeSchema,
  vcsSemanticNodeRefSchema,
  vcsWorkApplicationSchema,
  vcsWorkUnitSchema,
  vcsWorkspaceEventSchema,
  type VcsInspectResult,
  type VcsProvenanceEdge,
  type VcsSemanticNodeRef,
} from "@vibestudio/service-schemas/vcs";
import { NORMALIZATION_PROTOCOL, SEMANTIC_PROTOCOL, type StateNodeRef } from "@workspace/vcs-engine";
import { readHistoryWorkIntent } from "./doltMergeReview.js";
import {
  committedWorkspaceEvent,
  workspaceApplicationsAt,
  workspaceCommitForRef,
  workspaceMergeSourcesAt,
} from "./doltWorkspaceState.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";
import { MAX_ANCESTRY_EDGES, changeEffects, publicChangeKind } from "./semanticWorkspace.js";

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

function inspectEvent(sql: SqlStorage, revision: string, workspaceId: string, eventId: string) {
  const row = sql.exec(
    "SELECT * FROM dolt_at_events(?) WHERE event_id = ?", revision, eventId,
  ).toArray()[0];
  if (!row) throw new SemanticVcsError("InvalidReference", "Unknown workspace event");
  const [first, second, extra] = parentsAt(sql, revision);
  if (!first || extra) throw new SemanticVcsError("IntegrityFailure", "Workspace event has invalid native parents");
  const previous = committedWorkspaceEvent(sql, first);
  const applicationIds = previous ? workspaceApplicationsAt(sql, first, previous.head) : [];
  const integrated = second ? committedWorkspaceEvent(sql, second) : null;
  if (second && integrated?.head !== second) {
    throw new SemanticVcsError("IntegrityFailure", "Replayed workspace integration has no exact saved parent");
  }
  const sources = integrated ? [integrated.eventId]
    : previous ? workspaceMergeSourcesAt(sql, first, previous.head, applicationIds) : [];
  const parents = [...new Set([...(previous ? [previous.eventId] : []), ...sources])];
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

function inspectApplication(sql: SqlStorage, revision: string, applicationId: string) {
  const row = sql.exec(
    "SELECT * FROM dolt_at_applications(?) WHERE application_id = ?", revision, applicationId,
  ).toArray()[0];
  if (!row) throw new SemanticVcsError("InvalidReference", "Unknown workspace application");
  const [parent] = parentsAt(sql, revision);
  const basis = parent ? stateAt(sql, parent) : null;
  if (!basis) throw new SemanticVcsError("IntegrityFailure", "Workspace application has no exact native basis");
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
    const kind = relation === "copies" ? "copies-content" : relation === "incorporates"
      ? "incorporates-content" : "preserves-content";
    edges.push({ kind, from: { kind: "applied-change", appliedChangeId: String(child_applied_change_id) }, to });
  }
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
