import type { SqlStorage } from "@vibestudio/durable";
import {
  vcsWorkUnitSchema,
  type VcsInspectResult,
  type VcsProvenanceEdge,
  type VcsSemanticNodeRef,
} from "@vibestudio/service-schemas/vcs";
import { readHistoryWorkIntent } from "./doltMergeReview.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";

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
  if (root.kind === "work-unit") {
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
