import { compareUtf16CodeUnits } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import {
  type VcsSemanticNodeRef,
  type VcsWalkEntry,
  type VcsWalkInput,
  vcsTrajectoryInvocationRefSchema,
} from "@vibestudio/service-schemas/vcs";
import { firstSavedApplication } from "./doltWorkspaceMemory.js";
import { readHistoryWorkUnitIntent } from "./doltMergeReview.js";
import { inspectWorkspaceProvenance, workspaceFileHistoryWithOrigin } from "./doltWorkspaceProvenance.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";
import { publicChangeKind } from "./workspaceHistoryReads.js";

type Invocation = ReturnType<typeof vcsTrajectoryInvocationRefSchema.parse>;
type WalkPage = { entries: VcsWalkEntry[]; notes: string[] };

const maxScope = 2_000;
const maxRejections = 200;

function walkLabel(text: string, max = 400): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function authorsFor(sql: SqlStorage, at: string, commandId: string): string[] {
  return sql.exec(
    `SELECT work_unit_id FROM dolt_at_gad_work_units(?) WHERE command_id = ?
      ORDER BY work_unit_id LIMIT ?`,
    at, commandId, maxScope + 1,
  ).toArray().map(({ work_unit_id }) => String(work_unit_id));
}

function workRow(sql: SqlStorage, at: string, id: string) {
  return sql.exec(
    `SELECT kind, command_id, trigger_excerpt, trigger_sender_json
       FROM dolt_at_gad_work_units(?) WHERE work_unit_id = ?`,
    at, id,
  ).toArray()[0];
}

function invocationFor(sql: SqlStorage, at: string, commandId: string): Invocation | null {
  const row = sql.exec(
    "SELECT cause_log_id, cause_head, cause_invocation_id FROM dolt_at_commands(?) WHERE command_id = ?",
    at, commandId,
  ).toArray()[0];
  if (!row || row["cause_log_id"] === null || row["cause_head"] === null || row["cause_invocation_id"] === null)
    return null;
  return vcsTrajectoryInvocationRefSchema.parse({
    kind: "trajectory-invocation", logId: row["cause_log_id"],
    head: row["cause_head"], invocationId: row["cause_invocation_id"],
  });
}

function changeLabel(sql: SqlStorage, at: string, id: string): string {
  const row = sql.exec(
    `SELECT change.kind, coalesce(result.path, base.path) AS path
       FROM dolt_at_gad_changes(?1) AS change
       LEFT JOIN dolt_at_gad_change_coordinates(?1) AS base ON base.change_id = change.change_id AND base.role = 'base'
       LEFT JOIN dolt_at_gad_change_coordinates(?1) AS result ON result.change_id = change.change_id AND result.role = 'result'
      WHERE change.change_id = ?2`,
    at, id,
  ).toArray()[0];
  return row ? walkLabel(`${publicChangeKind(String(row["kind"]))}${row["path"] ? ` ${row["path"]}` : ""}`) : "change";
}

function eventApplications(sql: SqlStorage, at: string, workspaceId: string, subject: Extract<VcsSemanticNodeRef, { kind: "event" }>) {
  const event = inspectWorkspaceProvenance(sql, at, workspaceId, subject, 0).node;
  if (event.kind !== "event") throw new SemanticVcsError("IntegrityFailure", "Workspace event walk lost its subject");
  return event.value.applicationIds;
}

function applicationAuthor(sql: SqlStorage, at: string, applicationId: string): string | null {
  const row = sql.exec("SELECT work_unit_id FROM dolt_at_applications(?) WHERE application_id = ?", at, applicationId)
    .toArray()[0];
  return row ? String(row["work_unit_id"]) : null;
}

function workForChange(sql: SqlStorage, at: string, changeId: string): string | null {
  const row = sql.exec("SELECT work_unit_id FROM dolt_at_gad_changes(?) WHERE change_id = ?", at, changeId)
    .toArray()[0];
  return row ? String(row["work_unit_id"]) : null;
}

function appliedOrigin(sql: SqlStorage, at: string, appliedChangeId: string) {
  const row = sql.exec("SELECT change_id FROM dolt_at_gad_applied_changes(?) WHERE applied_change_id = ?", at, appliedChangeId)
    .toArray()[0];
  return row ? String(row["change_id"]) : null;
}

function latestFileOrigin(
  sql: SqlStorage, at: string, workspaceId: string, contextId: string,
  subject: Extract<VcsSemanticNodeRef, { kind: "file" }>,
): { changeId: string; appliedChangeId: string | null } | null {
  const { history, firstAppliedChangeId } = workspaceFileHistoryWithOrigin(sql, at, workspaceId, contextId, {
    root: subject, direction: "past", limit: 1,
  });
  const latest = history.entries[0]?.node;
  return latest?.kind === "change" ? { changeId: latest.changeId, appliedChangeId: firstAppliedChangeId } : null;
}

function walkOrigin(
  sql: SqlStorage, at: string, workspaceId: string, input: VcsWalkInput,
): { workUnitId: string | null; via: VcsSemanticNodeRef[]; changeId: string | null } {
  const { subject } = input;
  let workUnitId: string | null = null;
  let changeId: string | null = null;
  const via: VcsSemanticNodeRef[] = [];
  switch (subject.kind) {
    case "work-unit":
      workUnitId = subject.workUnitId;
      break;
    case "application":
      workUnitId = applicationAuthor(sql, at, subject.applicationId);
      break;
    case "event": {
      const source = eventApplications(sql, at, workspaceId, subject).at(-1);
      if (source) workUnitId = applicationAuthor(sql, at, source);
      break;
    }
    case "decision":
    case "external-delta": {
      const table = subject.kind === "decision" ? "gad_integration_decisions" : "gad_external_deltas";
      const key = subject.kind === "decision" ? "decision_id" : "delta_id";
      const id = subject.kind === "decision" ? subject.decisionId : subject.deltaId;
      const row = sql.exec(`SELECT work_unit_id FROM dolt_at_${table}(?) WHERE ${key} = ?`, at, id).toArray()[0];
      if (row) workUnitId = String(row["work_unit_id"]);
      break;
    }
    case "change":
      changeId = subject.changeId;
      break;
    case "applied-change":
      changeId = appliedOrigin(sql, at, subject.appliedChangeId);
      if (changeId) via.push({ kind: "change", changeId });
      break;
    case "file": {
      const origin = latestFileOrigin(sql, at, workspaceId, input.contextId, subject);
      if (!origin) break;
      changeId = origin.changeId;
      if (origin.appliedChangeId) via.push({ kind: "applied-change", appliedChangeId: origin.appliedChangeId });
      via.push({ kind: "change", changeId });
      break;
    }
  }
  if (changeId) workUnitId = workForChange(sql, at, changeId);
  return { workUnitId, via, changeId };
}

function noOrigin(subject: VcsSemanticNodeRef): WalkPage {
  return {
    entries: [{
      node: subject, label: `${subject.kind} has no authored origin in the record`,
      depth: 0, boundary: "no-recorded-cause",
    }],
    notes: [],
  };
}

export function workspaceCauseWalkAt(
  sql: SqlStorage, at: string, workspaceId: string, input: VcsWalkInput,
): WalkPage & { invocation: Invocation | null } {
  const { workUnitId, via } = walkOrigin(sql, at, workspaceId, input);
  if (!workUnitId) return { ...noOrigin(input.subject), invocation: null };
  const row = workRow(sql, at, workUnitId);
  if (!row) throw new SemanticVcsError("IntegrityFailure", "Workspace walk has no authored work");
  const kind = String(row["kind"]);
  const intent = readHistoryWorkUnitIntent(sql, at, workUnitId);
  const entries: VcsWalkEntry[] = via.map((node, depth) => ({
    node, depth, label: node.kind === "change" ? changeLabel(sql, at, node.changeId) : "applied change",
  }));
  const sender = typeof row["trigger_sender_json"] === "string" ? JSON.parse(row["trigger_sender_json"]) : null;
  const statement = typeof row["trigger_excerpt"] === "string" && row["trigger_excerpt"].trim() && intent.tier !== "trigger"
    ? { text: walkLabel(row["trigger_excerpt"].trim(), 2_000), sender: walkLabel(String(sender?.kind ?? "requester"), 200) }
    : undefined;
  const boundary = kind === "import" ? "import-snapshot" : kind === "external-unapplied" ? "external-delta" : undefined;
  entries.push({
    node: { kind: "work-unit", workUnitId }, label: `work unit · ${kind}`, depth: entries.length, intent,
    ...(statement ? { statement } : {}), ...(boundary ? { boundary } : {}),
  });
  if (boundary) {
    const note = boundary === "import-snapshot"
      ? "Authorship before this import boundary is outside workspace history."
      : "This work declares a change made outside the workspace.";
    return { entries, notes: [note], invocation: null };
  }
  const commandId = String(row["command_id"]);
  const command = sql.exec("SELECT method FROM dolt_at_commands(?) WHERE command_id = ?", at, commandId).toArray()[0];
  const invocation = invocationFor(sql, at, commandId);
  entries.push({
    node: { kind: "command", commandId }, label: `command · ${String(command?.["method"] ?? "unknown method")}`,
    depth: entries.length, ...(invocation ? {} : { boundary: "no-recorded-cause" }),
  });
  return { entries, notes: invocation ? [] : ["This command records no causing tool invocation."], invocation };
}

type Rejection = { entry: VcsWalkEntry; key: string; createdAt: string };

export function workspaceRejectionsWalk(
  sql: SqlStorage, at: string, revisions: readonly string[], workspaceId: string, input: VcsWalkInput,
): WalkPage {
  const { subject } = input;
  let fileId: string | null = null;
  let repositoryId: string | null = null;
  if (subject.kind === "file") {
    ({ fileId, repositoryId } = subject);
  } else if (subject.kind === "repository") {
    ({ repositoryId } = subject);
  } else {
    const { changeId } = walkOrigin(sql, at, workspaceId, input);
    if (changeId) {
      const coordinate = sql.exec(
        "SELECT file_id, repository_id FROM dolt_at_gad_change_coordinates(?) WHERE change_id = ? ORDER BY role LIMIT 1",
        at, changeId,
      ).toArray()[0];
      fileId = typeof coordinate?.["file_id"] === "string" ? coordinate["file_id"] : null;
      repositoryId = typeof coordinate?.["repository_id"] === "string" ? coordinate["repository_id"] : null;
    }
  }
  if (!fileId && !repositoryId) return {
    entries: [], notes: ["This subject has no file or repository coordinate to collect rejections for."],
  };

  const rejections = new Map<string, Rejection>();
  for (const revision of revisions) {
    const items = sql.exec(
      `WITH counteractions AS (
         SELECT DISTINCT 'counteractions' AS category, counteraction.change_id AS id, work.work_unit_id,
                work.created_at, counteracted.work_unit_id AS attempted_id,
                counteraction.counteracted_change_id AS attempted_change_id, NULL AS reason, NULL AS rationale
           FROM dolt_at_gad_change_coordinates(?1) AS coordinate
           JOIN dolt_at_gad_change_counteractions(?1) AS counteraction
             ON counteraction.counteracted_change_id = coordinate.change_id
           JOIN dolt_at_gad_changes(?1) AS counteracted ON counteracted.change_id = coordinate.change_id
           JOIN dolt_at_gad_changes(?1) AS counteracting ON counteracting.change_id = counteraction.change_id
           JOIN dolt_at_gad_work_units(?1) AS work ON work.work_unit_id = counteracting.work_unit_id
          WHERE coordinate.file_id = ?2 OR (?2 IS NULL AND coordinate.repository_id = ?3)
          ORDER BY work.created_at DESC, id LIMIT ?4
       ), reverts AS (
         SELECT DISTINCT 'reverts', work.work_unit_id, work.work_unit_id, work.created_at, NULL, NULL, NULL, NULL
           FROM dolt_at_gad_work_units(?1) AS work
           JOIN dolt_at_gad_changes(?1) AS change USING (work_unit_id)
           JOIN dolt_at_gad_change_coordinates(?1) AS coordinate USING (change_id)
          WHERE work.kind = 'revert' AND
                (coordinate.file_id = ?2 OR (?2 IS NULL AND coordinate.repository_id = ?3))
          ORDER BY work.created_at DESC, work.work_unit_id LIMIT ?4
       ), deltas AS (
         SELECT 'external', delta.delta_id, delta.work_unit_id, delta.created_at, NULL, NULL, delta.repo_path, NULL
           FROM dolt_at_gad_external_deltas(?1) AS delta
          WHERE delta.repository_id = ?3 AND delta.status = 'superseded'
          ORDER BY delta.created_at DESC, delta.delta_id LIMIT ?4
       ), declined AS (
         SELECT 'merge', entry.decision_id, decision.work_unit_id, decision.created_at, NULL, NULL, entry.resolution, entry.rationale
           FROM dolt_at_gad_merge_decision_entries(?1) AS entry
           JOIN dolt_at_gad_integration_decisions(?1) AS decision USING (decision_id)
          WHERE entry.resolution IN ('ours', 'current') AND
                ((entry.coordinate_kind = 'file' AND entry.coordinate_id = ?2) OR
                 (?2 IS NULL AND entry.coordinate_kind = 'repository' AND entry.coordinate_id = ?3))
          ORDER BY decision.created_at DESC, entry.decision_id LIMIT ?4
       )
       SELECT * FROM counteractions UNION ALL SELECT * FROM reverts
       UNION ALL SELECT * FROM deltas UNION ALL SELECT * FROM declined`,
      revision, fileId, repositoryId, maxRejections,
    ).toArray();
    for (const item of items) {
      const { category, id, work_unit_id, created_at, attempted_id, attempted_change_id, reason, rationale } = item;
      const key = JSON.stringify([category, id, attempted_change_id]);
      if (rejections.has(key)) continue;
      const workUnitId = String(work_unit_id);
      const common = { depth: 0, intent: readHistoryWorkUnitIntent(sql, revision, workUnitId) };
      let entry: VcsWalkEntry;
      if (category === "counteractions") {
        const attempted = readHistoryWorkUnitIntent(sql, revision, String(attempted_id));
        entry = {
          ...common, node: { kind: "work-unit", workUnitId }, group: category,
          label: walkLabel(`undone · ${changeLabel(sql, revision, String(attempted_change_id))}`),
          detail: `attempted (${attempted.tier}): ${walkLabel(attempted.text, 300)}`,
        };
      } else if (category === "reverts") {
        entry = { ...common, node: { kind: "work-unit", workUnitId }, label: "revert", group: category };
      } else if (category === "external") {
        entry = {
          ...common, node: { kind: "external-delta", deltaId: String(id) }, group: category,
          label: walkLabel(`superseded external delta · ${String(reason)}`),
        };
      } else if (category === "merge") {
        entry = {
          ...common, node: { kind: "decision", decisionId: String(id) }, group: category,
          label: `incoming change declined · resolved ${String(reason)}`,
          ...(typeof rationale === "string" && rationale ? { detail: `rationale: ${walkLabel(rationale, 300)}` } : {}),
        };
      } else {
        throw new SemanticVcsError("IntegrityFailure", "Workspace rejection has an unknown category");
      }
      rejections.set(key, { entry, key, createdAt: String(created_at) });
    }
  }
  const ordered = [...rejections.values()].sort((left, right) =>
    compareUtf16CodeUnits(left.entry.group!, right.entry.group!) ||
    compareUtf16CodeUnits(right.createdAt, left.createdAt) ||
    compareUtf16CodeUnits(left.key, right.key),
  );
  const groupCounts = new Map<string, number>();
  const entries = ordered.flatMap(({ entry }) => {
    const category = entry.group!;
    const count = (groupCounts.get(category) ?? 0) + 1;
    groupCounts.set(category, count);
    return count <= maxRejections ? [entry] : [];
  });
  return {
    entries, notes: entries.length ? [] : ["Nothing has been rejected at this coordinate in your visible basis."],
  };
}

type CohortSeed =
  | { kind: "work"; workUnitIds: string[] }
  | { kind: "invocation"; invocation: Invocation; workUnitId: string }
  | { kind: "turn"; turn: Extract<VcsSemanticNodeRef, { kind: "trajectory-turn" }> };

export function workspaceCohortSeedAt(
  sql: SqlStorage, at: string | null, workspaceId: string, input: VcsWalkInput,
): CohortSeed | null {
  const { subject, scope } = input;
  if (subject.kind === "trajectory-turn") return { kind: "turn", turn: subject };
  if (!at) return null;
  if (subject.kind === "event") return {
    kind: "work",
    workUnitIds: eventApplications(sql, at, workspaceId, subject)
      .flatMap((id) => applicationAuthor(sql, at, id) ?? []),
  };
  if (subject.kind === "command")
    return { kind: "work", workUnitIds: authorsFor(sql, at, subject.commandId) };
  const { workUnitId } = walkOrigin(sql, at, workspaceId, input);
  if (!workUnitId) return null;
  if (scope !== "work-unit") {
    const row = workRow(sql, at, workUnitId);
    if (row) {
      const commandId = String(row["command_id"]);
      if (scope === "command") return { kind: "work", workUnitIds: authorsFor(sql, at, commandId) };
      const invocation = invocationFor(sql, at, commandId);
      if (invocation) return { kind: "invocation", invocation, workUnitId };
    }
  }
  return { kind: "work", workUnitIds: [workUnitId] };
}

/** Only versioned command tuples from the selected revisions may contribute cohort work. */
export function workspaceCohortWalk(
  sql: SqlStorage,
  revisions: readonly string[],
  input: VcsWalkInput,
  seed: CohortSeed | null,
  invocations: readonly Invocation[],
): WalkPage {
  if (!seed) return noOrigin(input.subject);
  const workUnitIds = seed.kind === "work" ? seed.workUnitIds
    : seed.kind === "invocation" ? [seed.workUnitId] : [];
  const scope = JSON.stringify(workUnitIds);
  const causeTuples = JSON.stringify(invocations.map((item) => [item.logId, item.head, item.invocationId]));
  const units = new Map<string, { kind: string; revision: string }>();
  const coordinates = new Map<string, { label: string; changeIds: Set<string> }>();
  const decisions = new Set<string>();
  const commits = new Map<string, NonNullable<ReturnType<typeof firstSavedApplication>>>();
  for (const revision of revisions) {
    const selected = sql.exec(
      `SELECT work.work_unit_id, work.kind FROM dolt_at_gad_work_units(?1) AS work
        WHERE work.work_unit_id IN (SELECT value FROM json_each(?2))
           OR work.command_id IN (
             SELECT command.command_id FROM json_each(?3) AS cause CROSS JOIN dolt_at_commands(?1) AS command
              WHERE command.cause_log_id = json_extract(cause.value, '$[0]')
                AND command.cause_head = json_extract(cause.value, '$[1]')
                AND command.cause_invocation_id = json_extract(cause.value, '$[2]')
           ) LIMIT ?4`,
      revision, scope, causeTuples, maxScope + 1,
    ).toArray();
    if (!selected.length) continue;
    for (const row of selected) {
      const key = String(row["work_unit_id"]);
      if (!units.has(key)) units.set(key, { kind: String(row["kind"]), revision });
    }
    if (units.size > maxScope) throw new SemanticVcsError("ScopeTooLarge", "Workspace cohort contains too many work units");
    const selection = JSON.stringify(selected.map((row) => String(row["work_unit_id"])));
    const rows = sql.exec(
      `WITH selected AS MATERIALIZED (SELECT value AS id FROM json_each(?2))
       SELECT 'change' AS kind, change.change_id AS id, coalesce(result.path, base.path) AS path
         FROM selected JOIN dolt_at_gad_changes(?1) AS change ON change.work_unit_id = selected.id
         LEFT JOIN dolt_at_gad_change_coordinates(?1) AS base ON base.change_id = change.change_id AND base.role = 'base'
         LEFT JOIN dolt_at_gad_change_coordinates(?1) AS result ON result.change_id = change.change_id AND result.role = 'result'
       UNION ALL
       SELECT 'decision', decision.decision_id, NULL FROM selected
         JOIN dolt_at_gad_integration_decisions(?1) AS decision ON decision.work_unit_id = selected.id
       UNION ALL
       SELECT 'application', application.application_id, NULL FROM selected
         JOIN dolt_at_applications(?1) AS application ON application.work_unit_id = selected.id
       LIMIT ?3`,
      revision, selection, maxScope + 1,
    ).toArray();
    if (rows.length > maxScope) throw new SemanticVcsError("ScopeTooLarge", "Workspace cohort has too many authored effects");
    for (const row of rows) {
      const id = String(row["id"]);
      if (row["kind"] === "decision") {
        decisions.add(id);
      } else if (row["kind"] === "application") {
        const saved = firstSavedApplication(sql, revision, id);
        if (saved) commits.set(saved.event.eventId, saved);
      } else {
        const label = row["path"] === null ? "workspace coordinate" : String(row["path"]);
        const coordinate = coordinates.get(label) ?? { label, changeIds: new Set<string>() };
        coordinate.changeIds.add(id);
        coordinates.set(label, coordinate);
      }
    }
  }
  const entries: VcsWalkEntry[] = [];
  const sorted = (values: Iterable<string>) => [...values].sort(compareUtf16CodeUnits);
  for (const workUnitId of sorted(units.keys())) {
    const { kind, revision } = units.get(workUnitId)!;
    entries.push({
      node: { kind: "work-unit", workUnitId }, label: `work unit · ${kind}`,
      depth: 0, group: "work", intent: readHistoryWorkUnitIntent(sql, revision, workUnitId),
    });
  }
  for (const coordinate of [...coordinates.values()].sort((a, b) =>
    b.changeIds.size - a.changeIds.size || compareUtf16CodeUnits(a.label, b.label),
  )) {
    const count = coordinate.changeIds.size;
    entries.push({
      node: { kind: "change", changeId: sorted(coordinate.changeIds)[0]! }, depth: 0, group: "coordinates",
      label: walkLabel(`${coordinate.label} · ${count} change${count === 1 ? "" : "s"}`),
    });
  }
  for (const decisionId of sorted(decisions)) {
    entries.push({
      node: { kind: "decision", decisionId }, label: "integration decision", depth: 0, group: "decisions",
    });
  }
  for (const commit of [...commits.values()].sort((a, b) =>
    compareUtf16CodeUnits(b.createdAt, a.createdAt) || compareUtf16CodeUnits(a.event.eventId, b.event.eventId),
  )) {
    entries.push({ node: commit.event, label: `commit · ${walkLabel(commit.message ?? "no message", 200)}`, depth: 0, group: "commits" });
  }
  if (entries.length > maxScope) throw new SemanticVcsError("ScopeTooLarge", "Workspace cohort is too large to present");
  return {
    entries,
    notes: entries.length ? [] : ["This subject carries no authored work in your visible basis."],
  };
}
