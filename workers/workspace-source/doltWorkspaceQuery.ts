import type { SqlStorage } from "@vibestudio/durable";
import type { DoltStorage } from "@vibestudio/durable/dolt";
import type { VcsQueryInput, VcsQueryRefusal, VcsQueryResult } from "@vibestudio/service-schemas/vcs";
import type { StateNodeRef } from "@workspace/vcs-engine";
import { readHistoryWorkUnitIntent } from "./doltMergeReview.js";
import { eventLineageAt, workspaceApplicationBasis } from "./doltWorkspaceProvenance.js";
import { workspaceCommitForRef } from "./doltWorkspaceState.js";
import { tokenizeSql, validateProvenanceQuery, PROVENANCE_QUERY_BUDGET } from "./provenanceQuery.js";
import { provenanceCatalogSelect, PROV_RESOLVER_PROTOCOL, PROV_SCHEMA_VERSION } from "./provenanceViews.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";

type QueryRow = readonly (string | number | null)[];

export interface HistoryQueryTrajectories {
  invocations: readonly QueryRow[];
  turns: readonly QueryRow[];
  messages: readonly QueryRow[];
  truncated: boolean;
}

const text = (value: string) => `'${value.replaceAll("'", "''")}'`;
const json = (value: unknown) => text(JSON.stringify(value));
const formatCell = (value: unknown): string | number | null => {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint" && value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }
  const rendered = String(value);
  return rendered.length <= PROVENANCE_QUERY_BUDGET.cellTextLimit
    ? rendered : `${rendered.slice(0, PROVENANCE_QUERY_BUDGET.cellTextLimit - 1)}…`;
};

const topologyBound = 1_000;
const invocationsColumns = ["log_id", "head", "invocation_id", "turn_id", "status", "terminal_outcome", "input_log_id", "input_head", "input_message_id"];
const turnsColumns = ["log_id", "head", "turn_id", "ordinal", "trigger_message_id", "summary"];
const messagesColumns = ["log_id", "head", "message_id", "turn_id", "role", "sender_kind", "sender_id",
  "source_message_id", "text_excerpt", "text_length"];

const projectionRows = (columns: readonly string[], rows: readonly QueryRow[]) =>
  `SELECT ${columns.map((column, index) => `json_extract(value, '$[${index}]') AS ${column}`).join(", ")}
     FROM json_each(${json(rows)})`;

export function queryUsesTrajectories(input: VcsQueryInput): boolean {
  return tokenizeSql(input.query).some(({ lower }) =>
    lower === "prov_invocations" || lower === "prov_turns" || lower === "prov_messages" || lower === "prov_search",
  );
}

function topologyRows(sql: SqlStorage, revisions: readonly string[], names: ReadonlySet<string>) {
  const eventParents: QueryRow[] = [];
  const eventApplications: QueryRow[] = [];
  const applications: QueryRow[] = [];
  const wantsEvents = names.has("prov_event_parents") || names.has("prov_event_applications");
  const wantsApplications = names.has("prov_applications");
  if (!wantsEvents && !wantsApplications) return { eventParents, eventApplications, applications };
  const rows = sql.exec(
    `WITH selected AS (SELECT value AS revision FROM json_each(?1))
     SELECT 'event' AS kind, event.event_id AS id, min(selected.revision) AS revision, NULL AS work_unit_id
       FROM selected CROSS JOIN dolt_at_events(selected.revision) AS event WHERE ?2 = 1 GROUP BY event.event_id
     UNION ALL
     SELECT 'application', app.application_id, min(selected.revision), app.work_unit_id
       FROM selected CROSS JOIN dolt_at_applications(selected.revision) AS app
      WHERE ?3 = 1 GROUP BY app.application_id, app.work_unit_id
     LIMIT ?4`,
    JSON.stringify(revisions), Number(wantsEvents), Number(wantsApplications), topologyBound + 1,
  ).toArray();
  if (rows.length > topologyBound)
    throw new SemanticVcsError("ScopeTooLarge", "Workspace query has too many history states for the selected topology relations");
  const seen = new Set<string>();
  for (const row of rows) {
    const { kind, id, revision, work_unit_id } = row;
    if ((kind !== "event" && kind !== "application") || typeof id !== "string" || typeof revision !== "string") {
      throw new SemanticVcsError("IntegrityFailure", "Workspace query returned an invalid topology record");
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const ref: StateNodeRef = kind === "event" ? { kind, eventId: id } : { kind, applicationId: id };
    const origin = workspaceCommitForRef(sql, revision, ref);
    if (!origin) throw new SemanticVcsError("IntegrityFailure", "Workspace query has a state without an exact revision");
    if (kind === "event") {
      const { parents, applicationIds } = eventLineageAt(sql, origin);
      parents.forEach((parent, ordinal) => eventParents.push([id, parent, ordinal]));
      applicationIds.forEach((application, ordinal) => eventApplications.push([id, application, ordinal]));
    } else {
      if (typeof work_unit_id !== "string")
        throw new SemanticVcsError("IntegrityFailure", "Workspace query has an application without authored work");
      const basis = workspaceApplicationBasis(sql, origin);
      applications.push([id, work_unit_id, basis.kind, basis.kind === "event" ? basis.eventId : basis.applicationId]);
    }
  }
  return { eventParents, eventApplications, applications };
}

function resolvedLegacyIntents(sql: SqlStorage, revisions: readonly string[]) {
  const selected = new Map<string, QueryRow>();
  for (const revision of revisions) {
    const rows = sql.exec(
      `SELECT work_unit_id FROM dolt_at_gad_work_units(?)
        WHERE resolved_intent_tier IS NULL OR resolved_intent_text IS NULL LIMIT ?`,
      revision, topologyBound + 1,
    ).toArray();
    if (rows.length > topologyBound)
      throw new SemanticVcsError("ScopeTooLarge", "Workspace query needs too many historical intent records");
    for (const { work_unit_id } of rows) {
      if (typeof work_unit_id !== "string" || selected.has(work_unit_id)) continue;
      const intent = readHistoryWorkUnitIntent(sql, revision, work_unit_id);
      selected.set(work_unit_id, [work_unit_id, intent.tier, intent.text]);
    }
    if (selected.size > topologyBound)
      throw new SemanticVcsError("ScopeTooLarge", "Workspace query needs too many historical intent records");
  }
  return projectionRows(["work_unit_id", "tier", "text"], [...selected.values()]);
}

function workspaceQueryProjections(
  sql: SqlStorage, revisions: readonly string[], names: ReadonlySet<string>, trajectory: HistoryQueryTrajectories,
): Record<string, string> {
  const at = (table: string, alias: string) => `dolt_at_${table}(basis.value) AS ${alias}`;
  const from = (table: string, alias: string) => `json_each(${json(revisions)}) AS basis CROSS JOIN ${at(table, alias)}`;
  const topology = topologyRows(sql, revisions, names);
  const legacy = names.has("prov_work_units") || names.has("prov_search")
    ? resolvedLegacyIntents(sql, revisions) : projectionRows(["work_unit_id", "tier", "text"], []);
  return {
    prov_schema: provenanceCatalogSelect(),
    prov_schema_version: `SELECT ${PROV_SCHEMA_VERSION} AS version`,
    prov_work_units: `SELECT DISTINCT work.work_unit_id, work.kind,
        coalesce(work.resolved_intent_tier, legacy.tier) AS intent_tier,
        coalesce(work.resolved_intent_text, legacy.text) AS intent_text,
        coalesce(work.resolver_protocol, ${text(PROV_RESOLVER_PROTOCOL)}) AS resolver_protocol,
        work.author_context_id, work.command_id, work.created_at, work.content_class
        FROM ${from("gad_work_units", "work")}
        LEFT JOIN (${legacy}) AS legacy USING (work_unit_id)`,
    prov_changes: `SELECT DISTINCT change.change_id, change.work_unit_id, change.kind, result.file_id,
        coalesce(result.repository_id, base.repository_id) AS repository_id, base.path AS base_path,
        result.path AS result_path, change.effect_digest
        FROM ${from("gad_changes", "change")}
        LEFT JOIN ${at("gad_change_coordinates", "base")} ON base.change_id = change.change_id AND base.role = 'base'
        LEFT JOIN ${at("gad_change_coordinates", "result")} ON result.change_id = change.change_id AND result.role = 'result'`,
    prov_applied_changes: `SELECT DISTINCT applied_change_id, application_id, change_id, ordinal
        FROM ${from("gad_applied_changes", "applied")}`,
    prov_content_edges: `SELECT DISTINCT child_applied_change_id, parent_ref_json, relation
        FROM ${from("gad_content_edges", "edge")}`,
    prov_events: `SELECT DISTINCT event_id, kind, message, created_at, command_id FROM ${from("events", "event")}`,
    prov_event_parents: projectionRows(["event_id", "parent_event_id", "ordinal"], topology.eventParents),
    prov_event_applications: projectionRows(["event_id", "application_id", "ordinal"], topology.eventApplications),
    prov_applications: projectionRows(["application_id", "work_unit_id", "basis_kind", "basis_id"], topology.applications),
    prov_decisions: `SELECT DISTINCT decision_id, work_unit_id, target_state_kind, target_state_id, source_event_id,
        source_delta_id, created_at FROM ${from("gad_integration_decisions", "decision")}`,
    prov_decision_entries: `SELECT DISTINCT decision_id, coordinate_kind, coordinate_id, resolution, rationale, result_change_id
        FROM ${from("gad_merge_decision_entries", "entry")}`,
    prov_counteractions: `SELECT DISTINCT change_id, counteracted_change_id FROM ${from("gad_change_counteractions", "counter")}`,
    prov_external_deltas: `SELECT DISTINCT delta_id, work_unit_id, repository_id, repo_path, status,
        superseded_by_delta_id, created_at FROM ${from("gad_external_deltas", "delta")}`,
    prov_commands: `SELECT DISTINCT command_id, method, 'complete' AS status, cause_invocation_id, cause_log_id,
        cause_head, created_at FROM ${from("commands", "command")}`,
    prov_invocations: projectionRows(invocationsColumns, trajectory.invocations),
    prov_turns: projectionRows(turnsColumns, trajectory.turns),
    prov_messages: projectionRows(messagesColumns, trajectory.messages),
    prov_files: `SELECT file_id, repository_id, path, presence, last_change_id FROM (
        SELECT file.file_id, file.repository_id, file.path, file.presence,
          coalesce(file.tombstone_change_id, (
            SELECT coordinate.change_id FROM ${at("gad_change_coordinates", "coordinate")}
              JOIN ${at("gad_changes", "change")} USING (change_id)
              JOIN ${at("gad_work_units", "work")} USING (work_unit_id)
             WHERE coordinate.file_id = file.file_id AND coordinate.role = 'result'
             ORDER BY work.created_at DESC, coordinate.change_id LIMIT 1
          )) AS last_change_id,
          ROW_NUMBER() OVER (PARTITION BY file.file_id ORDER BY CAST(basis.key AS INTEGER)) AS priority
          FROM ${from("files", "file")}
      ) WHERE priority = 1`,
    prov_search: `SELECT 'work-unit' AS subject_kind, work_unit_id AS subject_id,
          NULL AS log_id, NULL AS head, 'work unit · ' || kind AS label, intent_text AS text
        FROM prov_work_units
        UNION ALL
        SELECT 'event', event_id, NULL, NULL, 'event · ' || kind, message
          FROM prov_events WHERE message IS NOT NULL
        UNION ALL
        SELECT 'decision', decision_id, NULL, NULL, 'integration decision', group_concat(rationale, char(10))
          FROM prov_decision_entries WHERE rationale IS NOT NULL GROUP BY decision_id
        UNION ALL
        SELECT 'external-delta', delta.delta_id, NULL, NULL, 'external delta · ' || repo_path, work.intent_text
          FROM prov_external_deltas AS delta JOIN prov_work_units AS work USING (work_unit_id)
        UNION ALL
        SELECT 'trajectory-message', message_id, log_id, head, 'message · ' || role, text_excerpt
          FROM prov_messages WHERE text_length > 0`,
  };
}

export function queryWorkspaceHistory(
  sql: SqlStorage,
  dolt: Pick<DoltStorage, "queryScoped">,
  input: VcsQueryInput,
  state: StateNodeRef,
  revisions: readonly string[],
  trajectory: HistoryQueryTrajectories,
): VcsQueryResult {
  const empty = {
    state, schemaVersion: PROV_SCHEMA_VERSION, columns: [], rows: [], rowsRead: 0, truncated: false,
  };
  const refusal = validateProvenanceQuery(input.query);
  if (refusal) return { ...empty, refusal };
  const names = new Set(tokenizeSql(input.query).map(({ lower }) => lower));
  const limit = Math.min(input.limit, PROVENANCE_QUERY_BUDGET.rowLimit);
  const bounded = `SELECT * FROM (\n${input.query.replace(/;\s*$/u, "")}\n) LIMIT ${limit + 1}`;
  try {
    if (trajectory.truncated || JSON.stringify(trajectory).length > 400_000)
      throw new SemanticVcsError("ScopeTooLarge", "Workspace query has too much admitted trajectory evidence");
    if (!dolt.queryScoped) throw new Error("The runtime does not support scoped queries");
    const result = dolt.queryScoped(bounded, workspaceQueryProjections(sql, revisions, names, trajectory), {
      maxRows: limit + 1, limits: { maxVmSteps: PROVENANCE_QUERY_BUDGET.scanBudget },
    });
    return {
      ...empty,
      columns: result.columns.slice(0, 64).map((name, index) => name.slice(0, 120) || `column_${index}`),
      rows: result.rows.slice(0, limit).map((row) => row.slice(0, 64).map(formatCell)),
      rowsRead: result.rows.length,
      truncated: result.rows.length > limit,
      refusal: null,
    };
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    const scopeTooLarge = error instanceof SemanticVcsError && error.code === "ScopeTooLarge";
    const named: Pick<VcsQueryRefusal, "stage" | "code"> =
      code === "SQL_PROFILE_VIOLATION" ? { stage: "validation", code: "unknown-relation" }
        : code === "SQL_STEP_LIMIT" || code === "SQL_RESULT_LIMIT" || scopeTooLarge
          ? { stage: "execution", code: "scan-budget" } : { stage: "execution", code: "engine-error" };
    const message = code === "SQL_PROFILE_VIOLATION" ? "The query referenced a relation outside the admitted provenance views."
      : scopeTooLarge ? error.message : `Workspace query was refused by the database (${code ?? "engine-error"}).`;
    return { ...empty, refusal: { ...named, term: null, message } };
  }
}
