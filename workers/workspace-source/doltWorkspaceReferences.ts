import type { SqlStorage } from "@vibestudio/durable";
import type { VcsSemanticNodeRef } from "@vibestudio/service-schemas/vcs";
import { workspaceCommitForRef } from "./doltWorkspaceState.js";

/** Test semantic identity in one admitted revision, including inherited merge parents. */
export function workspaceReferenceAt(sql: SqlStorage, commit: string, ref: VcsSemanticNodeRef): boolean {
  const exists = (
    table: "gad_work_units" | "gad_changes" | "gad_applied_changes" | "gad_integration_decisions" | "gad_external_deltas" | "commands",
    column: "work_unit_id" | "change_id" | "applied_change_id" | "decision_id" | "delta_id" | "command_id",
    id: string,
  ) => sql.exec(
    `SELECT 1 FROM dolt_at_${table}(?) WHERE ${column} = ? LIMIT 1`,
    commit, id,
  ).toArray().length === 1;
  switch (ref.kind) {
    case "event":
    case "application":
      return workspaceCommitForRef(sql, commit, ref) !== null;
    case "repository":
    case "file":
      return workspaceCommitForRef(sql, commit, ref.state) !== null;
    case "work-unit":
      return exists("gad_work_units", "work_unit_id", ref.workUnitId);
    case "change":
      return exists("gad_changes", "change_id", ref.changeId);
    case "applied-change":
      return exists("gad_applied_changes", "applied_change_id", ref.appliedChangeId);
    case "decision":
      return exists("gad_integration_decisions", "decision_id", ref.decisionId);
    case "external-delta":
      return exists("gad_external_deltas", "delta_id", ref.deltaId);
    case "command":
      return exists("commands", "command_id", ref.commandId);
    case "trajectory":
    case "trajectory-invocation": {
      const invocation = ref.kind === "trajectory-invocation"
        ? ["AND cause_invocation_id = ?", ref.invocationId] as const
        : [""] as const;
      return sql.exec(
        `SELECT 1 FROM dolt_at_commands(?) WHERE cause_log_id = ? AND cause_head = ? ${invocation[0]} LIMIT 1`,
        commit, ref.logId, ref.head, ...invocation.slice(1),
      ).toArray().length === 1;
    }
    default:
      return false;
  }
}
