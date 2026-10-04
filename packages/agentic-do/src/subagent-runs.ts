/** Durable supervisor index for retained subagent execution results. */

import type { SqlStorage } from "@workspace/runtime/worker/durable-base";
import { assertExactSqlTableSchema } from "@workspace/runtime/worker/sql-table-schema";

export type SubagentRunStatus =
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "abandoned";

export interface SubagentRunRow {
  runId: string;
  /** Native launch task in this vessel's Pi session; retained with the collaborator. */
  nativeTaskId: number;
  taskChannelId: string;
  parentContextId: string | null;
  childContextId: string;
  childEntityId: string;
  childParticipantId: string | null;
  parentChannelId: string;
  mode: "fresh" | "fork";
  label: string;
  depth: number;
  status: SubagentRunStatus;
  sourceEventId: string | null;
  semanticIntegrationSnapshot: Record<string, unknown> | null;
  startedAt: number;
  lastActivityAt: number;
  launchConfig: Record<string, unknown> | null;
}

export type SubagentRunReferenceResolution = {
  kind: "exact";
  run: SubagentRunRow;
} | null;

const SUBAGENT_RUN_STATUSES = [
  "starting",
  "running",
  "completed",
  "failed",
  "cancelled",
  "abandoned",
] as const satisfies readonly SubagentRunStatus[];

interface SubagentRunSqlRow {
  run_id: string;
  native_task_id: number;
  task_channel_id: string;
  parent_context_id?: string | null;
  child_context_id: string;
  child_entity_id: string;
  child_participant_id: string | null;
  parent_channel_id: string;
  mode: string;
  label: string;
  depth: number;
  status: string;
  source_event_id: string | null;
  semantic_integration_json: string | null;
  started_at: number;
  last_activity_at: number;
  launch_config_json: string | null;
}

function exactEnum<const Value extends string>(
  field: string,
  value: unknown,
  allowed: readonly Value[]
): Value {
  if (typeof value === "string" && allowed.includes(value as Value)) return value as Value;
  throw new Error(`Invalid subagent_runs.${field}: ${JSON.stringify(value)}`);
}

function parseRecord(field: string, value: string | null): Record<string, unknown> | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid subagent_runs.${field}: ${JSON.stringify(value)}`);
  }
}

function toRow(row: SubagentRunSqlRow): SubagentRunRow {
  return {
    runId: row.run_id,
    nativeTaskId: Number(row.native_task_id),
    taskChannelId: row.task_channel_id,
    parentContextId: row.parent_context_id ?? null,
    childContextId: row.child_context_id,
    childEntityId: row.child_entity_id,
    childParticipantId: row.child_participant_id ?? null,
    parentChannelId: row.parent_channel_id,
    mode: exactEnum("mode", row.mode, ["fresh", "fork"] as const),
    label: row.label,
    depth: Number(row.depth),
    status: exactEnum("status", row.status, SUBAGENT_RUN_STATUSES),
    sourceEventId: row.source_event_id ?? null,
    semanticIntegrationSnapshot: parseRecord(
      "semantic_integration_json",
      row.semantic_integration_json
    ),
    startedAt: Number(row.started_at),
    lastActivityAt: Number(row.last_activity_at),
    launchConfig: parseRecord("launch_config_json", row.launch_config_json),
  };
}

/** A compact spelling of the native launch coordinate, never a cached alias. */
export function subagentRunReference(run: Pick<SubagentRunRow, "nativeTaskId">): string {
  if (!Number.isSafeInteger(run.nativeTaskId) || run.nativeTaskId <= 0)
    throw new Error("Subagent launch requires a positive native task identity");
  return `@s${run.nativeTaskId.toString(36)}`;
}

export class SubagentRunStore {
  constructor(private readonly sql: SqlStorage) {}

  static createTables(sql: SqlStorage): void {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS subagent_runs (
        run_id TEXT PRIMARY KEY,
        native_task_id INTEGER NOT NULL UNIQUE CHECK (native_task_id > 0),
        task_channel_id TEXT NOT NULL,
        parent_context_id TEXT,
        child_context_id TEXT NOT NULL,
        child_entity_id TEXT NOT NULL,
        child_participant_id TEXT,
        parent_channel_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        label TEXT NOT NULL,
        depth INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN (
          'starting', 'running', 'completed', 'failed', 'cancelled', 'abandoned'
        )),
        started_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL,
        launch_config_json TEXT,
        source_event_id TEXT,
        semantic_integration_json TEXT
      )
    `);
    assertExactSqlTableSchema(sql, {
      table: "subagent_runs",
      columns: [
        ["run_id", "TEXT", false],
        ["native_task_id", "INTEGER", true],
        ["task_channel_id", "TEXT", true],
        ["parent_context_id", "TEXT", false],
        ["child_context_id", "TEXT", true],
        ["child_entity_id", "TEXT", true],
        ["child_participant_id", "TEXT", false],
        ["parent_channel_id", "TEXT", true],
        ["mode", "TEXT", true],
        ["label", "TEXT", true],
        ["depth", "INTEGER", true],
        ["status", "TEXT", true],
        ["started_at", "INTEGER", true],
        ["last_activity_at", "INTEGER", true],
        ["launch_config_json", "TEXT", false],
        ["source_event_id", "TEXT", false],
        ["semantic_integration_json", "TEXT", false],
      ],
      primaryKey: ["run_id"],
    });
  }

  createTables(): void {
    SubagentRunStore.createTables(this.sql);
  }

  insert(row: SubagentRunRow): void {
    subagentRunReference(row);
    const existing = this.get(row.runId);
    if (existing && existing.nativeTaskId !== row.nativeTaskId)
      throw new Error("Child launch record changed its native task owner");
    this.sql.exec(
      `INSERT INTO subagent_runs
         (run_id, native_task_id, task_channel_id, parent_context_id, child_context_id, child_entity_id,
          child_participant_id, parent_channel_id, mode, label, depth, status,
          source_event_id, semantic_integration_json, started_at,
          last_activity_at, launch_config_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(run_id) DO NOTHING`,
      row.runId,
      row.nativeTaskId,
      row.taskChannelId,
      row.parentContextId,
      row.childContextId,
      row.childEntityId,
      row.childParticipantId,
      row.parentChannelId,
      row.mode,
      row.label,
      row.depth,
      row.status,
      row.sourceEventId,
      row.semanticIntegrationSnapshot ? JSON.stringify(row.semanticIntegrationSnapshot) : null,
      row.startedAt,
      row.lastActivityAt,
      row.launchConfig ? JSON.stringify(row.launchConfig) : null
    );
  }

  get(runId: string): SubagentRunRow | null {
    const row = this.sql.exec(`SELECT * FROM subagent_runs WHERE run_id = ?`, runId).toArray()[0];
    return row ? toRow(row as unknown as SubagentRunSqlRow) : null;
  }

  getBySourceEvent(sourceEventId: string): SubagentRunRow | null {
    return this.listBySourceEvent(sourceEventId)[0] ?? null;
  }

  listBySourceEvent(sourceEventId: string): SubagentRunRow[] {
    return this.sql
      .exec(
        `SELECT * FROM subagent_runs WHERE source_event_id = ? ORDER BY started_at, run_id`,
        sourceEventId
      )
      .toArray()
      .map((row) => toRow(row as unknown as SubagentRunSqlRow));
  }

  getByTaskChannel(taskChannelId: string): SubagentRunRow | null {
    const row = this.sql
      .exec(`SELECT * FROM subagent_runs WHERE task_channel_id = ?`, taskChannelId)
      .toArray()[0];
    return row ? toRow(row as unknown as SubagentRunSqlRow) : null;
  }

  listAll(): SubagentRunRow[] {
    return (
      this.sql.exec(`SELECT * FROM subagent_runs`).toArray() as unknown as SubagentRunSqlRow[]
    ).map(toRow);
  }

  listByStatus(status: SubagentRunStatus): SubagentRunRow[] {
    return (
      this.sql
        .exec(`SELECT * FROM subagent_runs WHERE status = ?`, status)
        .toArray() as unknown as SubagentRunSqlRow[]
    ).map(toRow);
  }

  listLive(): SubagentRunRow[] {
    return (
      this.sql
        .exec(`SELECT * FROM subagent_runs WHERE status IN ('starting', 'running')`)
        .toArray() as unknown as SubagentRunSqlRow[]
    ).map(toRow);
  }

  countLive(): number {
    const row = this.sql
      .exec(`SELECT COUNT(*) AS cnt FROM subagent_runs WHERE status IN ('starting', 'running')`)
      .toArray()[0];
    return Number(row?.["cnt"] ?? 0);
  }

  resolveReference(reference: string, parentChannelId?: string): SubagentRunReferenceResolution {
    let run: SubagentRunRow | null;
    if (/^@s[1-9a-z][0-9a-z]*$/u.test(reference)) {
      const taskId = Number.parseInt(reference.slice(2), 36);
      if (!Number.isSafeInteger(taskId) || taskId.toString(36) !== reference.slice(2)) return null;
      const row = this.sql
        .exec(`SELECT * FROM subagent_runs WHERE native_task_id = ?`, taskId)
        .toArray()[0];
      run = row ? toRow(row as unknown as SubagentRunSqlRow) : null;
    } else {
      run = this.get(reference);
    }
    return run && (!parentChannelId || run.parentChannelId === parentChannelId)
      ? { kind: "exact", run }
      : null;
  }

  setStatus(runId: string, status: SubagentRunStatus): void {
    this.sql.exec(`UPDATE subagent_runs SET status = ? WHERE run_id = ?`, status, runId);
  }

  /** Closing a turn makes a live execution idle. A retained terminal can be
   * superseded only by an explicit new execution, never by a late close event.
   * Keep the predicate in the mutation: another delivery may settle the run
   * while the caller is awaiting the child's activity read. */
  markExecutionIdle(runId: string): void {
    this.sql.exec(
      `UPDATE subagent_runs SET status = 'completed'
       WHERE run_id = ? AND status IN ('starting', 'running')`,
      runId
    );
  }

  setSourceEventId(runId: string, sourceEventId: string): void {
    this.sql.exec(
      `UPDATE subagent_runs SET source_event_id = ? WHERE run_id = ?`,
      sourceEventId,
      runId
    );
  }

  setSemanticIntegrationSnapshot(runId: string, value: Record<string, unknown>): void {
    this.sql.exec(
      `UPDATE subagent_runs SET semantic_integration_json = ? WHERE run_id = ?`,
      JSON.stringify(value),
      runId
    );
  }

  setChildParticipantId(runId: string, participantId: string | null): void {
    this.sql.exec(
      `UPDATE subagent_runs SET child_participant_id = ? WHERE run_id = ?`,
      participantId,
      runId
    );
  }

  setLaunchConfig(runId: string, launchConfig: Record<string, unknown> | null): void {
    this.sql.exec(
      `UPDATE subagent_runs SET launch_config_json = ? WHERE run_id = ?`,
      launchConfig ? JSON.stringify(launchConfig) : null,
      runId
    );
  }

  setChildEntityId(runId: string, childEntityId: string): void {
    this.sql.exec(
      `UPDATE subagent_runs SET child_entity_id = ? WHERE run_id = ?`,
      childEntityId,
      runId
    );
  }

  setParentContextId(runId: string, contextId: string): void {
    this.sql.exec(
      `UPDATE subagent_runs SET parent_context_id = ? WHERE run_id = ?`,
      contextId,
      runId
    );
  }

  touch(runId: string, at: number): void {
    this.sql.exec(`UPDATE subagent_runs SET last_activity_at = ? WHERE run_id = ?`, at, runId);
  }

  delete(runId: string): void {
    this.sql.exec(`DELETE FROM subagent_runs WHERE run_id = ?`, runId);
  }
}
