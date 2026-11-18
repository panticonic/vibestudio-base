import { canonicalJson } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import type { LegacyHistoryStep } from "./legacyHistoryReplay.js";

type Row = Readonly<Record<string, unknown>>;

export type LegacyProvenance =
  | {
      readonly kind: "event";
      readonly command: Row | null;
      readonly templateInstallation: Row | null;
      readonly externalSources: readonly {
        readonly link: Row;
        readonly delta: Row;
      }[];
    }
  | {
      readonly kind: "application";
      readonly command: Row | null;
      readonly workUnit: Row;
      readonly changes: readonly Row[];
      readonly coordinates: readonly Row[];
      readonly counteractions: readonly Row[];
      readonly appliedChanges: readonly Row[];
      readonly predicates: readonly Row[];
      readonly contentEdges: readonly Row[];
      readonly mappings: readonly Row[];
      readonly decision: Row | null;
      readonly decisionEntries: readonly Row[];
      readonly decisionSources: readonly Row[];
      readonly externalDelta: Row | null;
    };

/** Read the legacy rows owned by one history step from the frozen source. */
export function readLegacyProvenance(
  sql: SqlStorage,
  step: LegacyHistoryStep,
): LegacyProvenance {
  const command = (id: unknown) =>
    sql
      .exec(
        `
        SELECT command_id, scope_kind, scope_id, method, request_digest,
               cause_log_id, cause_head, cause_invocation_id, created_at
        FROM vcs_command_journal WHERE command_id = ?
      `,
        id,
      )
      .toArray()[0] ?? null;
  if (step.kind === "event") {
    const { eventId, commandId } = step.record;
    return {
      kind: "event",
      command: command(commandId),
      templateInstallation:
        sql
          .exec(
            "SELECT * FROM workspace_template_installations WHERE event_id = ?",
            eventId,
          )
          .toArray()[0] ?? null,
      externalSources: sql
        .exec(
          `
          SELECT * FROM gad_workspace_event_external_sources
          WHERE event_id = ? ORDER BY ordinal
      `,
          eventId,
        )
        .toArray()
        .map((link) => {
          const delta = sql
            .exec(
              "SELECT * FROM gad_external_deltas WHERE delta_id = ?",
              link["delta_id"],
            )
            .toArray()[0];
          if (!delta)
            throw new Error(
              `Missing external delta ${String(link["delta_id"])}`,
            );
          return { link, delta };
        }),
    };
  }

  const { workUnitId, applicationId } = step.record;
  const workUnit = sql
    .exec("SELECT * FROM gad_work_units WHERE work_unit_id = ?", workUnitId)
    .toArray()[0];
  if (!workUnit) throw new Error(`Missing legacy work unit ${workUnitId}`);
  const decision =
    sql
      .exec(
        "SELECT * FROM gad_integration_decisions WHERE work_unit_id = ?",
        workUnitId,
      )
      .toArray()[0] ?? null;
  return {
    kind: "application",
    command: command(workUnit["command_id"]),
    workUnit,
    changes: sql
      .exec(
        `
      SELECT * FROM gad_changes WHERE work_unit_id = ? ORDER BY operation, ordinal
    `,
        workUnitId,
      )
      .toArray(),
    coordinates: sql
      .exec(
        `
      SELECT p.* FROM gad_change_coordinates AS p JOIN gad_changes AS c USING (change_id)
      WHERE c.work_unit_id = ? ORDER BY c.operation, c.ordinal, p.role
    `,
        workUnitId,
      )
      .toArray(),
    counteractions: sql
      .exec(
        `
      SELECT p.* FROM gad_change_counteractions AS p JOIN gad_changes AS c USING (change_id)
      WHERE c.work_unit_id = ? ORDER BY c.operation, c.ordinal, p.ordinal
    `,
        workUnitId,
      )
      .toArray(),
    appliedChanges: sql
      .exec(
        `
      SELECT * FROM gad_applied_changes WHERE application_id = ? ORDER BY ordinal
    `,
        applicationId,
      )
      .toArray(),
    predicates: sql
      .exec(
        `
      SELECT p.* FROM gad_applied_change_predicates AS p JOIN gad_applied_changes AS a USING (applied_change_id)
      WHERE a.application_id = ? ORDER BY a.ordinal, p.ordinal
    `,
        applicationId,
      )
      .toArray(),
    contentEdges: sql
      .exec(
        `
      SELECT e.* FROM gad_content_edges AS e JOIN gad_applied_changes AS a
        ON e.child_applied_change_id = a.applied_change_id
      WHERE a.application_id = ? ORDER BY a.ordinal, e.content_edge_id
    `,
        applicationId,
      )
      .toArray(),
    mappings: sql
      .exec(
        `
      SELECT m.* FROM gad_content_edge_mappings AS m JOIN gad_content_edges AS e USING (content_edge_id)
      JOIN gad_applied_changes AS a ON e.child_applied_change_id = a.applied_change_id
      WHERE a.application_id = ? ORDER BY a.ordinal, e.content_edge_id, m.ordinal
    `,
        applicationId,
      )
      .toArray(),
    decision,
    decisionEntries: decision
      ? sql
          .exec(
            `
      SELECT * FROM gad_merge_decision_entries WHERE decision_id = ? ORDER BY coordinate_kind, coordinate_id
    `,
            decision["decision_id"],
          )
          .toArray()
      : [],
    decisionSources: decision
      ? sql
          .exec(
            `
      SELECT * FROM gad_decision_source_changes WHERE decision_id = ?
      ORDER BY coordinate_kind, coordinate_id, change_id
    `,
            decision["decision_id"],
          )
          .toArray()
      : [],
    externalDelta:
      sql
        .exec(
          "SELECT * FROM gad_external_deltas WHERE work_unit_id = ?",
          workUnitId,
        )
        .toArray()[0] ?? null,
  };
}

/** Keep immutable provenance in the same commit as its placement. */
export function writeLegacyProvenance(
  sql: SqlStorage,
  facts: LegacyProvenance,
): void {
  const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
  const save = (table: string, key: string, rows: readonly Row[]) => {
    const identity = key.split(" ");
    for (const row of rows) {
      const present = sql
        .exec(
          `SELECT * FROM ${quote(table)} WHERE ${identity.map((name) => `${quote(name)} = ?`).join(" AND ")}`,
          ...identity.map((name) => row[name]),
        )
        .toArray()[0];
      if (present) {
        if (canonicalJson(present) !== canonicalJson(row)) {
          throw new Error(`Conflicting legacy provenance in ${table}`);
        }
        continue;
      }
      const columns = Object.keys(row);
      sql.exec(
        `INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
        ...columns.map((name) => row[name]),
      );
    }
  };
  if (facts.command) save("commands", "command_id", [facts.command]);
  if (facts.kind === "event") {
    if (facts.templateInstallation) {
      save("workspace_template_installations", "event_id", [
        facts.templateInstallation,
      ]);
    }
    save(
      "gad_external_deltas",
      "delta_id",
      facts.externalSources.map(({ delta }) => delta),
    );
    save(
      "gad_workspace_event_external_sources",
      "event_id ordinal",
      facts.externalSources.map(({ link }) => link),
    );
    return;
  }
  save("gad_work_units", "work_unit_id", [facts.workUnit]);
  save("gad_changes", "change_id", facts.changes);
  save("gad_change_coordinates", "change_id role", facts.coordinates);
  save("gad_change_counteractions", "change_id ordinal", facts.counteractions);
  save("gad_applied_changes", "applied_change_id", facts.appliedChanges);
  save(
    "gad_applied_change_predicates",
    "applied_change_id ordinal",
    facts.predicates,
  );
  save("gad_content_edges", "content_edge_id", facts.contentEdges);
  save("gad_content_edge_mappings", "content_edge_id ordinal", facts.mappings);
  if (facts.externalDelta)
    save("gad_external_deltas", "delta_id", [facts.externalDelta]);
  if (facts.decision)
    save("gad_integration_decisions", "decision_id", [facts.decision]);
  save(
    "gad_merge_decision_entries",
    "decision_id coordinate_kind coordinate_id",
    facts.decisionEntries,
  );
  save(
    "gad_decision_source_changes",
    "decision_id coordinate_kind coordinate_id change_id",
    facts.decisionSources,
  );
}
