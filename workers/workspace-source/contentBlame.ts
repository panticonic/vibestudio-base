import { canonicalJson } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import { contentMappingDigest, type ContentMapping } from "@workspace/vcs-engine";
import type { ContentOriginRef } from "./semanticVcsStore.js";
import { contentMappingFromRow } from "./semanticVcsContentMappingCodec.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";

type Row = Record<string, unknown>;

interface BlameRoute {
  relation: "preserves-content" | "copies-content" | "incorporates-content";
  parent: ContentOriginRef;
  mappings: ContentMapping[];
}

interface BlameInterval {
  childStart: number;
  childEnd: number;
  parentStart: number;
  parentEnd: number;
  parentContentHash: string;
  route: BlameRoute;
}

const tableAt = (table: string, revision: string | undefined) =>
  revision === undefined ? table : `dolt_at_${table}(?1)`;

function bindingsAt(revision: string | undefined) {
  return {
    key: revision === undefined ? "?1" : "?2",
    parameters: (id: string) => revision === undefined ? [id] : [revision, id],
  };
}

export const contentMapping = (
  value: Omit<ContentMapping, "digest">,
): ContentMapping => ({
  ...value,
  digest: contentMappingDigest(value),
});

export function readBlameMappings(sql: SqlStorage, contentEdgeId: string, revision?: string): ContentMapping[] {
  const { key, parameters } = bindingsAt(revision);
  return sql.exec(
    `SELECT coordinate_kind, child_content_hash, child_start, child_end,
            parent_content_hash, parent_start, parent_end, digest
       FROM ${tableAt("gad_content_edge_mappings", revision)}
      WHERE content_edge_id = ${key} ORDER BY ordinal`,
    ...parameters(contentEdgeId),
  ).toArray().map(contentMappingFromRow);
}

/** Restore the exact unchanged-coordinate lineage of a text change in reverse. */
export function readInvertedCounteractionMappings(
  sql: SqlStorage,
  changeIds: readonly string[],
  child: Pick<ContentMapping, "coordinateKind"> & { contentHash: string },
  parent: Pick<ContentMapping, "coordinateKind"> & { contentHash: string },
  revision?: string,
): ContentMapping[] {
  if (changeIds.length !== 1) {
    throw new SemanticVcsError("IntegrityFailure", "A text counteraction must name exactly one original change");
  }
  const { key, parameters } = bindingsAt(revision);
  const row = sql.exec(
    `SELECT edge.content_edge_id
       FROM ${tableAt("gad_content_edges", revision)} edge
       JOIN ${tableAt("gad_applied_changes", revision)} applied
         ON applied.applied_change_id = edge.child_applied_change_id
      WHERE applied.change_id = ${key}
        AND edge.relation = 'incorporates'
        AND json_extract(applied.applied_result_json, '$.contentHash') = ?
        AND json_extract(applied.applied_base_json, '$.contentHash') = ?
      ORDER BY edge.content_edge_id LIMIT 1`,
    ...parameters(changeIds[0]!), parent.contentHash, child.contentHash,
  ).toArray()[0];
  if (typeof row?.["content_edge_id"] !== "string") {
    throw new SemanticVcsError("IntegrityFailure", `Counteracted text change ${changeIds[0]} has no exact content lineage`);
  }
  return readBlameMappings(sql, row["content_edge_id"], revision).map((mapping) => {
    if (
      mapping.coordinateKind !== child.coordinateKind ||
      mapping.coordinateKind !== parent.coordinateKind ||
      mapping.childContentHash !== parent.contentHash ||
      mapping.parentContentHash !== child.contentHash
    ) {
      throw new SemanticVcsError("IntegrityFailure", `Counteracted text change ${changeIds[0]} has mismatched content lineage`);
    }
    return contentMapping({
      coordinateKind: mapping.coordinateKind,
      childContentHash: mapping.parentContentHash,
      childStart: mapping.parentStart,
      childEnd: mapping.parentEnd,
      parentContentHash: mapping.childContentHash,
      parentStart: mapping.childStart,
      parentEnd: mapping.childEnd,
    });
  });
}

export function readAppliedBlameChange(sql: SqlStorage, appliedChangeId: string, revision?: string): {
  appliedChangeId: string;
  changeId: string;
  workUnitId: string;
  commandId: string;
  kind: string;
  workKind: string;
  baseContentHash: string | null;
} {
  const { key, parameters } = bindingsAt(revision);
  const row = sql
    .exec(
      `SELECT applied.applied_change_id, change.change_id, change.kind,
              change.work_unit_id, work.command_id, work.kind AS work_kind,
              json_extract(applied.applied_base_json, '$.contentHash') AS base_content_hash
         FROM ${tableAt("gad_applied_changes", revision)} applied
         JOIN ${tableAt("gad_changes", revision)} change ON change.change_id = applied.change_id
         JOIN ${tableAt("gad_work_units", revision)} work ON work.work_unit_id = change.work_unit_id
        WHERE applied.applied_change_id = ${key}`,
      ...parameters(appliedChangeId),
    )
    .toArray()[0] as Row | undefined;
  if (!row) {
    throw new SemanticVcsError(
      "IntegrityFailure",
      `Content lineage reaches missing applied change ${appliedChangeId}`,
    );
  }
  return {
    appliedChangeId,
    changeId: String(row["change_id"]),
    workUnitId: String(row["work_unit_id"]),
    commandId: String(row["command_id"]),
    kind: String(row["kind"]),
    workKind: String(row["work_kind"]),
    baseContentHash: typeof row["base_content_hash"] === "string" ? row["base_content_hash"] : null,
  };
}

/** Both parents can authenticate the same unchanged bytes in a composed file. */
function disjointBlameIntervals(
  intervals: BlameInterval[],
  change: ReturnType<typeof readAppliedBlameChange>,
): BlameInterval[] {
  if (!intervals.some((interval, index) => index > 0 && interval.childStart < intervals[index - 1]!.childEnd))
    return intervals;
  const boundaries = [...new Set(intervals.flatMap(({ childStart, childEnd }) => [childStart, childEnd]))]
    .sort((a, b) => a - b);
  const active = new Set<BlameInterval>();
  const result: BlameInterval[] = [];
  let next = 0;
  for (let index = 1; index < boundaries.length; index++) {
    const childStart = boundaries[index - 1]!;
    const childEnd = boundaries[index]!;
    for (const candidate of active) if (candidate.childEnd <= childStart) active.delete(candidate);
    while (intervals[next]?.childStart === childStart) active.add(intervals[next++]!);
    const candidates = [...active];
    if (candidates.length > 1 &&
        (change.kind !== "merge" || candidates.some(({ route }) => route.relation !== "incorporates-content") ||
          new Set(candidates.map(({ route }) => canonicalJson(route.parent))).size !== candidates.length)) {
      throw new SemanticVcsError("IntegrityFailure", `Applied change ${change.appliedChangeId} has overlapping blame routes`);
    }
    const preferred = candidates.find(({ parentContentHash }) => parentContentHash === change.baseContentHash)
      ?? candidates[0];
    if (!preferred) continue;
    const parentStart = preferred.parentStart + childStart - preferred.childStart;
    result.push({ ...preferred, childStart, childEnd, parentStart, parentEnd: parentStart + childEnd - childStart });
  }
  return result;
}

export function traceContentBlame(
  sql: SqlStorage,
  revision: string | undefined,
  origin: ContentOriginRef,
  segment: {
    rootStart: number;
    rootEnd: number;
    currentStart: number;
    currentEnd: number;
    coordinateKind: "utf16" | "byte";
    path: Row[];
    visited: Set<string>;
  },
  maximumSpans: number,
): Row[] {
  const { key, parameters } = bindingsAt(revision);
  if (maximumSpans <= 0) return [];
  if (segment.path.length >= 200) {
    throw new SemanticVcsError("ScopeTooLarge", "Blame lineage exceeds its edge bound", {
      maximum: 200,
    });
  }
  if (origin.kind === "file") {
    const events = revision === undefined ? "gad_workspace_events" : "events";
    const snapshot = revision === undefined ? "snapshot_json" : "snapshot_source";
    const event = sql.exec(
      `SELECT command_id, ${snapshot} AS snapshot_json, created_at
         FROM ${tableAt(events, revision)} WHERE event_id = ${key} AND kind = 'genesis'`,
      ...parameters(origin.state.eventId),
    ).toArray()[0];
    if (!event || event["snapshot_json"] == null)
      throw new SemanticVcsError("IntegrityFailure", "Content origin is not an initial snapshot");
    return [
      {
        start: segment.rootStart,
        end: segment.rootEnd,
        origin,
        source: JSON.parse(String(event["snapshot_json"])),
        command: { kind: "command", commandId: String(event["command_id"]) },
        createdAt: String(event["created_at"]),
        path: segment.path,
        stop: "snapshot-boundary",
      },
    ];
  }
  const appliedChangeId = origin.appliedChangeId;
  const visit = `${appliedChangeId}:${segment.currentStart}:${segment.currentEnd}`;
  if (segment.visited.has(visit)) {
    throw new SemanticVcsError("IntegrityFailure", "Content lineage contains a cycle");
  }
  const visited = new Set(segment.visited).add(visit);
  const current = readAppliedBlameChange(sql, appliedChangeId, revision);
  const routes: BlameRoute[] = [];
  const contentEdges = sql
    .exec(
      `SELECT content_edge_id, parent_ref_json, relation
         FROM ${tableAt("gad_content_edges", revision)}
        WHERE child_applied_change_id = ${key}
        ORDER BY content_edge_id`,
      ...parameters(appliedChangeId),
    )
    .toArray() as Row[];
  for (const edge of contentEdges) {
    routes.push({
      relation:
        edge["relation"] === "incorporates"
          ? "incorporates-content"
          : edge["relation"] === "copies"
            ? "copies-content"
            : "preserves-content",
      parent: JSON.parse(String(edge["parent_ref_json"])) as ContentOriginRef,
      mappings: readBlameMappings(sql, String(edge["content_edge_id"]), revision),
    });
  }

  const routed: BlameInterval[] = [];
  for (const route of routes) {
    for (const mapping of route.mappings) {
      if (mapping.coordinateKind !== segment.coordinateKind) {
        throw new SemanticVcsError(
          "IntegrityFailure",
          `Content mapping ${mapping.digest} uses the wrong coordinate space`
        );
      }
      const childStart = Math.max(segment.currentStart, mapping.childStart);
      const childEnd = Math.min(segment.currentEnd, mapping.childEnd);
      if (childStart >= childEnd) continue;
      if (mapping.childEnd - mapping.childStart !== mapping.parentEnd - mapping.parentStart) {
        throw new SemanticVcsError(
          "IntegrityFailure",
          `Content mapping ${mapping.digest} changes coordinate length`
        );
      }
      const parentStart = mapping.parentStart + childStart - mapping.childStart;
      routed.push({
        childStart,
        childEnd,
        parentStart,
        parentEnd: parentStart + childEnd - childStart,
        parentContentHash: mapping.parentContentHash,
        route,
      });
    }
  }
  routed.sort(
    (left, right) => left.childStart - right.childStart || left.childEnd - right.childEnd
  );
  const selected = disjointBlameIntervals(routed, current);
  const importTerminal = current.workKind === "import";
  const terminal = (start: number, end: number): Row => ({
    start: segment.rootStart + (start - segment.currentStart),
    end: segment.rootStart + (end - segment.currentStart),
    change: { kind: "change", changeId: current.changeId },
    appliedChange: {
      kind: "applied-change",
      appliedChangeId: current.appliedChangeId,
    },
    workUnit: { kind: "work-unit", workUnitId: current.workUnitId },
    command: { kind: "command", commandId: current.commandId },
    path: segment.path,
    stop: importTerminal ? "import-boundary" : "authored",
  });
  if (routed.length === 0) return [terminal(segment.currentStart, segment.currentEnd)];
  const result: Row[] = [];
  let cursor = segment.currentStart;
  for (const route of selected) {
    if (cursor < route.childStart) {
      result.push(terminal(cursor, route.childStart));
      if (result.length >= maximumSpans) return result;
    }
    const rootStart = segment.rootStart + route.childStart - segment.currentStart;
    result.push(
      ...traceContentBlame(
        sql, revision, route.route.parent,
        {
          rootStart,
          rootEnd: rootStart + route.childEnd - route.childStart,
          currentStart: route.parentStart,
          currentEnd: route.parentEnd,
          coordinateKind: segment.coordinateKind,
          path: [
            ...segment.path,
            {
              kind: route.route.relation,
              from: {
                kind: "applied-change",
                appliedChangeId: current.appliedChangeId,
              },
              to: route.route.parent,
            },
          ],
          visited,
        },
        maximumSpans - result.length
      )
    );
    if (result.length >= maximumSpans) return result;
    cursor = route.childEnd;
  }
  if (cursor < segment.currentEnd && result.length < maximumSpans) {
    result.push(terminal(cursor, segment.currentEnd));
  }
  return result;
}
