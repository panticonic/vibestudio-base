import { canonicalJson } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import {
  type VcsBlameSpan,
  type VcsReadMemoryEpisode,
  type VcsReadMemoryInput,
  type VcsReadMemoryResult,
  vcsBlameResultSchema,
  vcsReadMemoryEpisodeSchema,
  vcsTrajectoryInvocationRefSchema,
} from "@vibestudio/service-schemas/vcs";
import { splitRepoPath } from "@vibestudio/shared/runtime/entitySpec";
import type { StateNodeRef } from "@workspace/vcs-engine";
import { readHistoryWorkUnitIntent } from "./doltMergeReview.js";
import { inspectWorkspaceProvenance, workspaceFileHistory } from "./doltWorkspaceProvenance.js";
import { workspaceContentOriginsAt, workspaceTransferBasisAt } from "./doltWorkspaceState.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";
import { projectContentBlame } from "./workspaceHistoryReads.js";

type VcsTrajectoryInvocationRef = ReturnType<typeof vcsTrajectoryInvocationRefSchema.parse>;
type AuthoredSpan = Exclude<VcsBlameSpan, { stop: "snapshot-boundary" }>;
type AuthoredEpisode = Exclude<VcsReadMemoryEpisode, { stop: "snapshot-boundary" }>;

export function firstSavedApplication(
  sql: SqlStorage, revision: string, applicationId: string,
): AuthoredEpisode["commit"] {
  // Fetched commits can be outside local refs. Bind the containing commit
  // before scanning for its first parent.
  const row = sql.exec(
    `WITH RECURSIVE containing(hash) AS (
       SELECT ?1
       UNION
       SELECT parent.parent_hash FROM containing AS child
       JOIN dolt_commit_ancestors AS parent ON parent.commit_hash = child.hash
       WHERE parent.parent_hash IS NOT NULL AND EXISTS (
         SELECT 1 FROM dolt_at_applications(parent.parent_hash) AS applied
          WHERE applied.application_id = ?2
       )
     )
     SELECT events.event_id, events.message, events.created_at
       FROM containing
       CROSS JOIN dolt_commit_ancestors AS first
         ON first.commit_hash = containing.hash AND first.parent_index = 0
       CROSS JOIN dolt_diff_events(first.parent_hash, containing.hash) AS diff
       JOIN dolt_at_events(containing.hash) AS events ON events.event_id = diff.to_event_id
      WHERE diff.diff_type = 'added'
        AND NOT EXISTS (
          SELECT 1 FROM dolt_commit_ancestors AS parent
          CROSS JOIN dolt_at_events(parent.parent_hash) AS inherited
          WHERE parent.commit_hash = containing.hash AND parent.parent_index > 0
            AND inherited.event_id = events.event_id
        )
      ORDER BY events.created_at, events.event_id LIMIT 1`,
    revision, applicationId,
  ).toArray()[0];
  if (!row) return null;
  return {
    event: { kind: "event", eventId: String(row["event_id"]) },
    message: row["message"] === null ? null : String(row["message"]),
    createdAt: String(row["created_at"]),
  };
}

function arrivalAt(
  sql: SqlStorage, revision: string, span: AuthoredSpan,
): AuthoredEpisode["arrival"] {
  const incorporation = span.path.find(({ kind }) => kind === "incorporates-content");
  const anchor = incorporation?.from;
  const appliedChangeId = anchor?.kind === "applied-change" ? anchor.appliedChangeId : span.appliedChange.appliedChangeId;
  const row = sql.exec(
    `SELECT decision.decision_id, entry.coordinate_id, entry.resolution, entry.rationale
       FROM dolt_at_gad_applied_changes(?1) AS applied
       JOIN dolt_at_applications(?1) AS application USING (application_id)
       JOIN dolt_at_gad_integration_decisions(?1) AS decision USING (work_unit_id)
       JOIN dolt_at_gad_merge_decision_entries(?1) AS entry USING (decision_id)
      WHERE applied.applied_change_id = ?2
        AND entry.coordinate_kind = 'file' AND EXISTS (
          SELECT 1 FROM dolt_at_gad_change_coordinates(?1) AS coordinate
           WHERE coordinate.change_id = ?3 AND coordinate.file_id = entry.coordinate_id
        )
      ORDER BY decision.created_at, decision.decision_id LIMIT 1`,
    revision, appliedChangeId, span.change.changeId,
  ).toArray()[0];
  if (!row) return null;
  const decisionId = String(row["decision_id"]);
  const parents = incorporation
    ? sql.exec(
        `SELECT DISTINCT change.work_unit_id,
                CASE WHEN EXISTS (
                  SELECT 1 FROM dolt_at_gad_decision_source_changes(?1) AS source
                   WHERE source.decision_id = ?2 AND source.change_id = change.change_id
                ) THEN 'source' ELSE 'current' END AS role
           FROM dolt_at_gad_content_edges(?1) AS edge
           JOIN dolt_at_gad_applied_changes(?1) AS parent
             ON parent.applied_change_id = json_extract(edge.parent_ref_json, '$.appliedChangeId')
           JOIN dolt_at_gad_changes(?1) AS change ON change.change_id = parent.change_id
          WHERE edge.child_applied_change_id = ?3 AND edge.relation = 'incorporates'
          ORDER BY role DESC, change.work_unit_id LIMIT 2`,
        revision, decisionId, appliedChangeId,
      ).toArray()
    : sql.exec(
        `SELECT DISTINCT change.work_unit_id, 'source' AS role
           FROM dolt_at_gad_decision_source_changes(?1) AS source
           JOIN dolt_at_gad_changes(?1) AS change USING (change_id)
          WHERE source.decision_id = ?2 AND source.coordinate_kind = 'file'
            AND source.coordinate_id = ?3
          ORDER BY change.work_unit_id LIMIT 2`,
        revision, decisionId, row["coordinate_id"],
      ).toArray();
  return {
    decision: { kind: "decision", decisionId },
    resolution: row["resolution"] as NonNullable<AuthoredEpisode["arrival"]>["resolution"],
    mode: incorporation ? "arrived" : "accepted",
    rationale: row["rationale"] === null ? null : String(row["rationale"]),
    parentIntents: parents.map(({ work_unit_id, role }) => ({
      workUnitId: String(work_unit_id),
      role: role === "source" ? "source" : "current",
      intent: readHistoryWorkUnitIntent(sql, revision, String(work_unit_id)),
    })),
  };
}

function invocationAt(sql: SqlStorage, revision: string, commandId: string): VcsTrajectoryInvocationRef | null {
  const row = sql.exec(
    `SELECT cause_log_id, cause_head, cause_invocation_id
       FROM dolt_at_commands(?) WHERE command_id = ?`,
    revision, commandId,
  ).toArray()[0];
  if (!row || row["cause_log_id"] === null || row["cause_head"] === null || row["cause_invocation_id"] === null) {
    return null;
  }
  return vcsTrajectoryInvocationRefSchema.parse({
    kind: "trajectory-invocation", logId: row["cause_log_id"],
    head: row["cause_head"], invocationId: row["cause_invocation_id"],
  });
}

/** Project memory from the exact working revision. The host may hydrate only the returned invocation coordinates. */
export function workspaceReadMemoryAt(
  sql: SqlStorage, revision: string, workspaceId: string, state: StateNodeRef, input: VcsReadMemoryInput,
): { memory: VcsReadMemoryResult; invocations: (VcsTrajectoryInvocationRef | null)[] } {
  const { path, range, expectedContentHash } = input;
  const absent = { memory: { status: "unmanaged" as const, path }, invocations: [] };
  const split = splitRepoPath(path);
  if (!split?.repoRelPath) return absent;
  const basis = workspaceTransferBasisAt(sql, revision);
  const repository = basis.repositoryAtPath(split.repoPath);
  if (!repository) return absent;
  const { repositoryId } = repository;
  const file = basis.fileAtPath(repositoryId, split.repoRelPath);
  if (!file) return absent;
  if (file.contentHash !== expectedContentHash) {
    return {
      memory: { status: "stale", path, expectedContentHash, currentContentHash: file.contentHash },
      invocations: [],
    };
  }
  if (file.contentKind !== "text") {
    return { memory: { status: "unsupported", path, reason: "non-text" }, invocations: [] };
  }
  if (range.end > file.coordinateExtent) {
    throw new SemanticVcsError("InvalidReference", "Read-memory range exceeds the exact file extent");
  }

  const { fileId } = file;
  const root = { kind: "file" as const, state, repositoryId, fileId };
  const blame = vcsBlameResultSchema.parse(projectContentBlame({
    sql, revision, file,
    input: { state, repositoryId, fileId, range, limit: 500 },
    readOrigin: () => workspaceContentOriginsAt(sql, revision, [fileId]).get(fileId)?.ref,
    intentTier: (id) => readHistoryWorkUnitIntent(sql, revision, id).tier,
  }));
  const groups = new Map<string, { span: VcsBlameSpan; ranges: Array<typeof range>; covered: number }>();
  for (const span of blame.spans) {
    const key = span.stop === "snapshot-boundary"
      ? canonicalJson(span.origin)
      : canonicalJson([span.change.changeId, span.appliedChange.appliedChangeId]);
    const group = groups.get(key) ?? { span, ranges: [], covered: 0 };
    group.ranges.push({ start: span.start, end: span.end });
    group.covered += span.end - span.start;
    groups.set(key, group);
  }
  const invocations: (VcsTrajectoryInvocationRef | null)[] = [];
  const episodes = [...groups.values()]
    .sort((a, b) => b.covered - a.covered || a.span.start - b.span.start)
    .slice(0, input.episodeLimit)
    .map(({ span, ranges }) => {
      if (span.stop === "snapshot-boundary") {
        invocations.push(null);
        return {
          ranges, stop: span.stop, origin: span.origin,
          source: span.source, command: span.command, createdAt: span.createdAt,
        };
      }
      const applied = inspectWorkspaceProvenance(sql, revision, workspaceId, span.appliedChange, 0).node;
      const change = inspectWorkspaceProvenance(sql, revision, workspaceId, span.change, 0).node;
      const work = inspectWorkspaceProvenance(sql, revision, workspaceId, span.workUnit, 0).node;
      if (applied.kind !== "applied-change" || change.kind !== "change" || work.kind !== "work-unit") {
        throw new SemanticVcsError("IntegrityFailure", "Workspace memory has incomplete authored evidence");
      }
      invocations.push(invocationAt(sql, revision, span.command.commandId));
      return vcsReadMemoryEpisodeSchema.parse({
        ranges, stop: span.stop, change: span.change, appliedChange: span.appliedChange,
        workUnit: span.workUnit, command: span.command, changeKind: change.value.kind,
        counteractsChangeIds: change.value.counteractsChangeIds, intent: work.value.intent,
        authorContextId: work.value.authorContextId, createdAt: work.value.createdAt,
        externalSnapshot: work.value.externalSnapshot,
        commit: firstSavedApplication(sql, revision, applied.value.applicationId),
        arrival: arrivalAt(sql, revision, span),
        cause: null,
      });
    });
  const history = input.historyLimit > 0
    ? workspaceFileHistory(sql, revision, workspaceId, input.contextId, {
        root, direction: "past", limit: input.historyLimit,
      })
    : null;
  const count = sql.exec(
    `SELECT COUNT(*) AS total FROM (
       SELECT 1 FROM dolt_at_gad_change_coordinates(?1) AS coordinate
       JOIN dolt_at_gad_change_counteractions(?1) AS rejection
         ON rejection.counteracted_change_id = coordinate.change_id
       WHERE coordinate.file_id = ?2 LIMIT 200
     )`,
    revision, fileId,
  ).one()["total"];
  return {
    memory: {
      status: "attached", state, repositoryId, fileId, path, contentHash: file.contentHash,
      range, coordinateKind: "utf16", episodes, history: history?.entries ?? [],
      rejectionCount: Number(count),
      truncated: Boolean(blame.nextCursor || history?.nextCursor || groups.size > input.episodeLimit),
    },
    invocations,
  };
}
