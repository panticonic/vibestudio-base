import type { SqlStorage } from "@vibestudio/durable";
import {
  vcsWorkApplicationSchema,
  vcsWorkUnitSchema,
  vcsWorkspaceEventSchema,
  type VcsInspectResult,
  type VcsProvenanceEdge,
  type VcsSemanticNodeRef,
} from "@vibestudio/service-schemas/vcs";
import { SEMANTIC_PROTOCOL, type StateNodeRef } from "@workspace/vcs-engine";
import { readHistoryWorkIntent } from "./doltMergeReview.js";
import {
  committedWorkspaceEvent,
  workspaceApplicationsAt,
  workspaceCommitForRef,
  workspaceMergeSourcesAt,
} from "./doltWorkspaceState.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";
import { changeEffects } from "./semanticWorkspace.js";

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
  const appliedChanges = sql.exec(
    `SELECT applied.applied_change_id, applied.change_id, applied.ordinal, applied.applied_base_json,
            applied.applied_result_json, authored.kind, authored.payload_json,
            (SELECT predicate_json FROM dolt_at_gad_applied_change_predicates(?1) AS predicates
              WHERE predicates.applied_change_id = applied.applied_change_id
              ORDER BY ordinal LIMIT 1) AS result_predicate
       FROM dolt_at_gad_applied_changes(?1) AS applied
       JOIN dolt_at_gad_changes(?1) AS authored USING (change_id)
      WHERE applied.application_id = ?2 ORDER BY applied.ordinal LIMIT 200`,
    revision, applicationId,
  ).toArray().map((applied) => {
    const json = (value: unknown) => typeof value === "string" ? JSON.parse(value) : null;
    return {
      appliedChangeId: applied["applied_change_id"], applicationId, changeId: applied["change_id"],
      ordinal: applied["ordinal"], resultPredicate: json(applied["result_predicate"]),
      appliedEffects: changeEffects({
        kind: String(applied["kind"]), base: json(applied["applied_base_json"]),
        result: json(applied["applied_result_json"]), payload: json(applied["payload_json"]),
      }),
    };
  });
  const count = sql.exec(
    "SELECT COUNT(*) AS count FROM dolt_at_gad_applied_changes(?) WHERE application_id = ?", revision, applicationId,
  ).toArray()[0]?.["count"];
  return vcsWorkApplicationSchema.parse({
    applicationId, revision, workUnitId: row["work_unit_id"], semanticProtocol: row["semantic_protocol"],
    basis, appliedChanges, appliedChangeCount: count,
  });
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
    appendPlacementEdges(sql, revision, root, edgeLimit + 1, edges);
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
