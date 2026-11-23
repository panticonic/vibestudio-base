import { canonicalJson } from "@vibestudio/content-addressing";
import { type VcsBlameInput } from "@vibestudio/service-schemas/vcs";
import type { SqlStorage } from "@vibestudio/durable";
import { SemanticVcsError } from "./semanticVcsErrors.js";
import type {
  AuthoredCopySourceEndpoint,
  ChangeRecord,
  ContentOriginRef,
} from "./semanticHistoryRecords.js";
import { traceContentBlame } from "./contentBlame.js";
import {
  semanticCursor,
  parseSemanticCursor,
} from "./workspaceHistoryPagination.js";

type Row = Record<string, unknown>;

export const coordinateKindForFile = (state: {
  contentKind: "text" | "bytes";
}): "utf16" | "byte" => (state.contentKind === "text" ? "utf16" : "byte");

export type ContentEndpoint = {
  fileId: string;
  contentHash: string;
  coordinateKind: "utf16" | "byte";
  coordinateExtent: number;
};

export type FileContentOrigin = {
  ref: ContentOriginRef;
  content: ContentEndpoint | null;
  authoredChangeId: string | null;
  authoredByWorkUnitId: string | null;
  contentClass: "internal" | "external";
  externalKeys: string[];
};

export type LatestAppliedFileChange = {
  fileId: string;
  appliedChangeId: string;
  changeId: string;
  workUnitId: string;
  commandId: string;
  kind: string;
  contentClass: "internal" | "external";
  externalKeys: string[];
  content: ContentEndpoint | null;
};

export const publicChangeKind = (kind: string): string => {
  switch (kind) {
    case "text":
      return "text-edit";
    case "repo-add":
      return "repository-create";
    case "repo-delete":
      return "repository-delete";
    case "repo-restore":
      return "repository-restore";
    case "repo-move":
      return "repository-move";
    default:
      return kind;
  }
};

export function semanticCoordinatePath(endpoint: Row): string | undefined {
  if (
    endpoint["kind"] === "repository" &&
    typeof endpoint["repoPath"] === "string"
  )
    return endpoint["repoPath"];
  if (
    endpoint["kind"] === "file" &&
    typeof endpoint["repoPath"] === "string" &&
    typeof endpoint["path"] === "string"
  )
    return `${endpoint["repoPath"]}/${endpoint["path"]}`;
  return undefined;
}

export function describeSemanticEffects(
  workKind: string,
  changes: readonly Pick<ChangeRecord, "kind" | "result" | "base">[],
): string {
  if (changes.length === 0)
    return `${workKind} decision with no fact transition`;
  const descriptions = changes.map((change) => {
    const endpoint = change.result ?? change.base ?? {};
    const subject =
      semanticCoordinatePath(endpoint) ??
      (typeof endpoint["fileId"] === "string"
        ? endpoint["fileId"]
        : typeof endpoint["repositoryId"] === "string"
          ? endpoint["repositoryId"]
          : "workspace coordinate");
    return `${publicChangeKind(change.kind)} ${subject}`;
  });
  const unique = [...new Set(descriptions)];
  const visible = unique.slice(0, 12).join("; ");
  return unique.length > 12
    ? `${visible}; and ${unique.length - 12} more effects`
    : visible;
}

export const changeEffects = (
  change: Pick<ChangeRecord, "kind" | "base" | "result" | "payload">,
) => {
  const base = change.base;
  const result = change.result;
  const fileId =
    typeof result?.["fileId"] === "string"
      ? result["fileId"]
      : typeof base?.["fileId"] === "string"
        ? base["fileId"]
        : null;
  if (fileId) {
    const effects: Row[] = [];
    const beforeContentHash =
      base?.["kind"] === "file" && typeof base["contentHash"] === "string"
        ? base["contentHash"]
        : null;
    const afterContentHash =
      result?.["kind"] === "file" && typeof result["contentHash"] === "string"
        ? result["contentHash"]
        : null;
    if (beforeContentHash !== afterContentHash) {
      effects.push({
        kind: "content",
        fileId,
        beforeContentHash,
        afterContentHash,
      });
    }
    const placement = (value: Row | null) =>
      value?.["kind"] === "file" &&
      typeof value["repositoryId"] === "string" &&
      typeof value["path"] === "string"
        ? { repositoryId: value["repositoryId"], path: value["path"] }
        : null;
    const before = placement(base);
    const after = placement(result);
    if (canonicalJson(before) !== canonicalJson(after)) {
      effects.push({ kind: "placement", fileId, before, after });
    }
    const beforeMode = base?.["kind"] === "file" ? Number(base["mode"]) : null;
    const afterMode =
      result?.["kind"] === "file" ? Number(result["mode"]) : null;
    if (beforeMode !== afterMode) {
      effects.push({ kind: "mode", fileId, beforeMode, afterMode });
    }
    if (effects.length > 0) return effects;
  }
  const repositoryId =
    typeof result?.["repositoryId"] === "string"
      ? result["repositoryId"]
      : typeof base?.["repositoryId"] === "string"
        ? base["repositoryId"]
        : null;
  if (repositoryId) {
    return [
      {
        kind: "repository-placement",
        repositoryId,
        beforePath:
          base?.["kind"] === "repository" &&
          typeof base["repoPath"] === "string"
            ? base["repoPath"]
            : null,
        afterPath:
          result?.["kind"] === "repository" &&
          typeof result["repoPath"] === "string"
            ? result["repoPath"]
            : null,
      },
    ];
  }
  throw new SemanticVcsError(
    "IntegrityFailure",
    `Change ${change.kind} has no public effect`,
  );
};

const parseBlameCursor = (
  cursor: string | undefined,
  range: { start: number; end: number },
  basis: Row,
): number => {
  const position = parseSemanticCursor(cursor, "blame", basis);
  if (!position) return range.start;
  const nextStart = Number(position["nextStart"]);
  if (
    !Number.isSafeInteger(nextStart) ||
    nextStart! < range.start ||
    nextStart! >= range.end
  ) {
    throw new SemanticVcsError(
      "InvalidReference",
      "Blame cursor does not match the exact range",
    );
  }
  return nextStart!;
};

const blameCursor = (basis: Row, nextStart: number): string =>
  semanticCursor("blame", basis, { nextStart });

/** Render exact byte or text lineage from an exact revision. */
export function projectContentBlame(options: {
  sql: SqlStorage;
  revision?: string;
  input: VcsBlameInput;
  file: { contentKind: "text" | "bytes"; coordinateExtent: number };
  readOrigin: () => ContentOriginRef | undefined;
  intentTier: (workUnitId: string) => unknown;
}): Row {
  const { sql, revision, input, file, readOrigin, intentTier } = options;
  if (input.range.end > file.coordinateExtent) {
    throw new SemanticVcsError(
      "InvalidReference",
      "Blame range exceeds the exact file extent",
    );
  }
  if (input.range.start === input.range.end) {
    return {
      state: input.state,
      fileId: input.fileId,
      coordinateKind: coordinateKindForFile(file),
      spans: [],
      nextCursor: null,
    };
  }
  const coordinateKind = coordinateKindForFile(file);
  const terminal = readOrigin();
  if (!terminal)
    throw new SemanticVcsError(
      "IntegrityFailure",
      `Placed file ${input.fileId} has no content origin`,
    );
  const cursorBasis = {
    ...(revision === undefined ? {} : { revision }),
    state: input.state,
    repositoryId: input.repositoryId,
    fileId: input.fileId,
    range: input.range,
  };
  const traceStart = parseBlameCursor(input.cursor, input.range, cursorBasis);
  const spans = traceContentBlame(
    sql,
    revision,
    terminal,
    {
      rootStart: traceStart,
      rootEnd: input.range.end,
      currentStart: traceStart,
      currentEnd: input.range.end,
      coordinateKind,
      path: [],
      visited: new Set(),
    },
    input.limit + 1,
  );
  const ordered = spans.sort(
    (left, right) =>
      Number(left["start"]) - Number(right["start"]) ||
      Number(left["end"]) - Number(right["end"]),
  );
  const page = ordered.slice(0, input.limit).map((span) => {
    if (span["stop"] === "snapshot-boundary") return span;
    const workUnitId = String((span["workUnit"] as Row)["workUnitId"]);
    return {
      ...span,
      workUnitId,
      tier: intentTier(workUnitId),
    };
  });
  const next = ordered[input.limit];
  return {
    state: input.state,
    fileId: input.fileId,
    coordinateKind,
    spans: page,
    nextCursor: next ? blameCursor(cursorBasis, Number(next["start"])) : null,
  };
}

export function changeRecord(
  changeId: string,
  row: Row | undefined,
): ChangeRecord {
  if (!row)
    throw new SemanticVcsError(
      "InvalidReference",
      `Unknown change ${changeId}`,
    );
  return {
    changeId,
    workUnitId: String(row["work_unit_id"]),
    operation: Number(row["operation"]),
    ordinal: Number(row["ordinal"]),
    kind: String(row["kind"]),
    source:
      row["source_json"] == null
        ? null
        : (JSON.parse(
            String(row["source_json"]),
          ) as AuthoredCopySourceEndpoint),
    base:
      row["base_json"] == null ? null : JSON.parse(String(row["base_json"])),
    result:
      row["result_json"] == null
        ? null
        : JSON.parse(String(row["result_json"])),
    payload: JSON.parse(String(row["payload_json"])),
    effectDigest: String(row["effect_digest"]),
  };
}

export function contentEndpoint(endpoint: Row | null): ContentEndpoint | null {
  if (
    endpoint?.["kind"] !== "file" ||
    typeof endpoint["fileId"] !== "string" ||
    typeof endpoint["contentHash"] !== "string" ||
    (endpoint["contentKind"] !== "text" &&
      endpoint["contentKind"] !== "bytes") ||
    typeof endpoint["coordinateExtent"] !== "number"
  ) {
    return null;
  }
  return {
    fileId: endpoint["fileId"],
    contentHash: endpoint["contentHash"],
    coordinateKind: endpoint["contentKind"] === "text" ? "utf16" : "byte",
    coordinateExtent: endpoint["coordinateExtent"],
  };
}

/** Interpret candidate lineage rows in chronological application order at one immutable state. */
export function readAppliedFileChanges(
  sql: SqlStorage,
  applications: readonly string[],
  fileIds: readonly string[],
  revision?: string,
): Map<string, LatestAppliedFileChange> {
  if (applications.length === 0 || fileIds.length === 0) return new Map();
  const table = (name: string) =>
    revision === undefined ? name : `dolt_at_${name}(?3)`;
  const rows = sql
    .exec(
      `WITH selected_applications AS (
         SELECT CAST(key AS INTEGER) AS application_ordinal,
                CAST(value AS TEXT) AS application_id
           FROM json_each(?1)
       ),
       selected_files AS (
         SELECT CAST(value AS TEXT) AS file_id FROM json_each(?2)
       ),
       candidates AS (
         SELECT coordinate.file_id, applied.applied_change_id,
                applied.applied_base_json, applied.applied_result_json, applied.ordinal,
                selected.application_ordinal, change.change_id, change.kind,
                change.work_unit_id, work.command_id, work.content_class,
                work.external_lineage_json
           FROM selected_applications selected
           JOIN ${table("gad_applied_changes")} applied
             ON applied.application_id = selected.application_id
           JOIN ${table("gad_changes")} change ON change.change_id = applied.change_id
           JOIN ${table("gad_work_units")} work ON work.work_unit_id = change.work_unit_id
           JOIN ${table("gad_change_coordinates")} coordinate ON coordinate.change_id = change.change_id
           JOIN selected_files file ON file.file_id = coordinate.file_id
          WHERE work.kind <> 'external-unapplied' OR EXISTS (
            SELECT 1 FROM ${table("gad_applied_change_predicates")} placement
             WHERE placement.applied_change_id = applied.applied_change_id
               AND json_extract(placement.predicate_json, '$.fileId') = file.file_id
          )
         UNION
         SELECT CAST(json_extract(predicate.predicate_json, '$.fileId') AS TEXT),
                applied.applied_change_id, applied.applied_base_json,
                applied.applied_result_json, applied.ordinal,
                selected.application_ordinal, change.change_id, change.kind,
                change.work_unit_id, work.command_id, work.content_class,
                work.external_lineage_json
           FROM selected_applications selected
           JOIN ${table("gad_applied_changes")} applied
             ON applied.application_id = selected.application_id
           JOIN ${table("gad_changes")} change ON change.change_id = applied.change_id
           JOIN ${table("gad_work_units")} work ON work.work_unit_id = change.work_unit_id
           JOIN ${table("gad_applied_change_predicates")} predicate
             ON predicate.applied_change_id = applied.applied_change_id
           JOIN selected_files file
             ON file.file_id =
                CAST(json_extract(predicate.predicate_json, '$.fileId') AS TEXT)
       ),
       ranked AS (
         SELECT *,
                ROW_NUMBER() OVER (
                  PARTITION BY file_id
                  ORDER BY application_ordinal DESC, ordinal DESC
                ) AS lineage_rank
           FROM candidates
       )
       SELECT file_id, applied_change_id, applied_base_json, applied_result_json,
              change_id, kind, work_unit_id, command_id, content_class,
              external_lineage_json
         FROM ranked
        WHERE lineage_rank = 1`,
      canonicalJson(applications),
      canonicalJson([...new Set(fileIds)]),
      ...(revision === undefined ? [] : [revision]),
    )
    .toArray() as Row[];
  const result = new Map<string, LatestAppliedFileChange>();
  for (const row of rows) {
    const fileId = String(row["file_id"]);
    const contentClass = row["content_class"];
    if (contentClass !== "internal" && contentClass !== "external") {
      throw new SemanticVcsError(
        "IntegrityFailure",
        `File ${fileId} has no valid persisted content class`,
      );
    }
    const externalKeys = JSON.parse(String(row["external_lineage_json"]));
    if (
      !Array.isArray(externalKeys) ||
      !externalKeys.every((key) => typeof key === "string")
    ) {
      throw new SemanticVcsError(
        "IntegrityFailure",
        `File ${fileId} has invalid persisted external lineage`,
      );
    }
    const appliedResult =
      row["applied_result_json"] == null
        ? null
        : (JSON.parse(String(row["applied_result_json"])) as Row);
    const appliedBase =
      row["applied_base_json"] == null
        ? null
        : (JSON.parse(String(row["applied_base_json"])) as Row);
    result.set(fileId, {
      fileId,
      appliedChangeId: String(row["applied_change_id"]),
      changeId: String(row["change_id"]),
      workUnitId: String(row["work_unit_id"]),
      commandId: String(row["command_id"]),
      kind: String(row["kind"]),
      contentClass,
      externalKeys,
      content: contentEndpoint(appliedResult) ?? contentEndpoint(appliedBase),
    });
  }
  return result;
}
