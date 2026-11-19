import { canonicalJson, compareUtf16CodeUnits } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import type { VcsCompareInput, VcsExternalDeltaResult } from "@vibestudio/service-schemas/vcs";
import { classifyMergeAspect, threeWayTextMerge } from "@workspace/vcs-engine";
import { paginateHistoryComparison, reviewIntents, type HistoryMergeCoordinate } from "./doltMergeReview.js";
import { readHistoryMergeObservations, type HistoryMergeObservation } from "./doltTextMerge.js";
import { workspaceEditBasisAt } from "./doltWorkspaceState.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";

type PlacedFile = NonNullable<ReturnType<ReturnType<typeof workspaceEditBasisAt>["file"]>>;
type File = Omit<PlacedFile, "presence" | "fileStateId">;

export interface HistoryExternalMergeSource {
  head: string;
  draft: string;
  delta: VcsExternalDeltaResult;
  base: VcsCompareInput["target"];
}

function readEndpoint(value: unknown, repositoryId: string): File | null {
  if (typeof value !== "string") throw new SemanticVcsError("IntegrityFailure", "External change has no endpoint");
  const endpoint = JSON.parse(value);
  if (endpoint?.kind === "missing") return null;
  if (endpoint?.kind !== "file" || endpoint.repositoryId !== repositoryId ||
      typeof endpoint.fileId !== "string" || typeof endpoint.path !== "string" ||
      typeof endpoint.contentHash !== "string" || !Number.isSafeInteger(endpoint.mode) ||
      !Number.isSafeInteger(endpoint.byteLength) || !Number.isSafeInteger(endpoint.coordinateExtent) ||
      (endpoint.contentKind !== "text" && endpoint.contentKind !== "bytes")) {
    throw new SemanticVcsError("IntegrityFailure", "External change has an invalid file endpoint");
  }
  const { fileId, path, mode, contentHash, contentKind, byteLength, coordinateExtent } = endpoint;
  return { fileId, repositoryId, path, mode, contentHash, contentKind, byteLength, coordinateExtent };
}

function fields(file: File | null) {
  return {
    presence: file !== null,
    placement: file && { repositoryId: file.repositoryId, path: file.path },
    mode: file?.mode ?? null,
    content: file && { hash: file.contentHash, kind: file.contentKind },
  };
}

/** Compare upstream's old and new bytes against the participant's exact current files. */
export function inspectExternalMerge(sql: SqlStorage, source: HistoryExternalMergeSource) {
  const { head, draft, delta } = source;
  const { repositoryId, workUnitId, deltaId } = delta;
  const basis = workspaceEditBasisAt(sql, head);
  const repository = basis.repository(repositoryId);
  const rows = sql.exec(
    `SELECT change_id, base_json, result_json FROM dolt_at_gad_changes(?)
      WHERE work_unit_id = ? ORDER BY operation, ordinal, change_id LIMIT 10001`,
    draft, workUnitId,
  ).toArray();
  if (rows.length > 10_000) throw new SemanticVcsError("ScopeTooLarge", "External comparison exceeds its coordinate bound");
  const decisions = sql.exec(
    `SELECT entry.coordinate_id, entry.decision_id, entry.resolution
       FROM dolt_at_gad_integration_decisions(?1) AS decision
       JOIN dolt_at_gad_merge_decision_entries(?1) AS entry USING (decision_id)
      WHERE decision.source_delta_id = ?2 AND entry.coordinate_kind = 'file'
      ORDER BY decision.created_at, decision.decision_id`,
    head, deltaId,
  ).toArray();
  const resolved = new Map(decisions.map((row) => [String(row["coordinate_id"]), {
    decisionId: String(row["decision_id"]), resolution: String(row["resolution"]),
  }]));
  const authoredPath = (file: File) => delta.repoPath ? `${delta.repoPath}/${file.path}` : file.path;
  const localPath = (file: File) => {
    const repo = basis.repository(file.repositoryId);
    if (!repo) throw new SemanticVcsError("IntegrityFailure", "External comparison has a file without a repository");
    return repo.repoPath ? `${repo.repoPath}/${file.path}` : file.path;
  };
  const entries = rows.map(({ change_id, base_json, result_json }) => {
    const before = readEndpoint(base_json, repositoryId);
    const theirs = readEndpoint(result_json, repositoryId);
    const id = (before ?? theirs)?.fileId;
    if (!id || typeof change_id !== "string" || (before && theirs && before.fileId !== theirs.fileId)) {
      throw new SemanticVcsError("IntegrityFailure", "External change has no single file identity");
    }
    const ours = basis.file(id);
    const paths = {
      ...(before ? { base: authoredPath(before) } : {}),
      ...(ours ? { ours: localPath(ours) } : {}),
      ...(theirs ? { theirs: repository ? localPath(theirs) : authoredPath(theirs) } : {}),
    };
    const peer = theirs ? sql.exec(
      `SELECT file_id FROM dolt_at_files(?) WHERE repository_id = ? AND path = ?
        AND presence = 'placed' AND file_id <> ?`,
      head, repositoryId, theirs.path, id,
    ).toArray()[0]?.["file_id"] : undefined;
    const collision = typeof peer === "string" ? { kind: "file" as const, id: peer } : null;
    const structural = Boolean(collision) || (!repository && Boolean(theirs));
    const baseFields = fields(before);
    const ourFields = fields(ours);
    const theirFields = fields(theirs);
    const aspects: HistoryMergeCoordinate["aspects"] = [];
    for (const aspect of ["presence", "placement", "mode", "content"] as const) {
      const base = baseFields[aspect];
      const local = ourFields[aspect];
      const remote = theirFields[aspect];
      const values = { base: canonicalJson(base), ours: canonicalJson(local), theirs: canonicalJson(remote) };
      if (values.base === values.ours && values.base === values.theirs) continue;
      aspects.push({ aspect, base, ours: local, theirs: remote, status: classifyMergeAspect({ aspect, ...values }) });
    }
    const textCandidate = !resolved.has(id) && !structural && aspects.some(({ aspect, status }) =>
      aspect === "content" && status === "conflict") && aspects.every(({ aspect, status }) =>
      aspect === "content" || status !== "conflict") && before?.contentKind === "text" &&
      ours?.contentKind === "text" && theirs?.contentKind === "text"
      ? { before, ours, theirs } : null;
    return { id, paths, before, ours, theirs, changeId: change_id, aspects, collision, structural, textCandidate };
  });
  return { entries, decisions: resolved, concluded: decisions.length > 0 || delta.status === "finalized" };
}

export function reviewExternalMerge(
  sql: SqlStorage, input: VcsCompareInput, source: HistoryExternalMergeSource,
  observation: HistoryMergeObservation | null,
): ReturnType<typeof paginateHistoryComparison> {
  const { entries, decisions, concluded } = inspectExternalMerge(sql, source);
  const hashes = [...new Set(entries.flatMap(({ textCandidate }) => textCandidate ?
    [textCandidate.before.contentHash, textCandidate.ours.contentHash, textCandidate.theirs.contentHash] : [],
  ))].sort(compareUtf16CodeUnits);
  if (hashes.length > 0 && !observation) return { kind: "read-content", contentHashes: hashes };
  const observed = observation ? readHistoryMergeObservations(hashes, observation) : new Map<string, string>();
  const coordinates: HistoryMergeCoordinate[] = entries.map((entry) => {
    const { id, paths, changeId, collision, structural, textCandidate } = entry;
    const decision = decisions.get(id);
    const composed = textCandidate && threeWayTextMerge(
      observed.get(textCandidate.before.contentHash)!,
      observed.get(textCandidate.ours.contentHash)!,
      observed.get(textCandidate.theirs.contentHash)!,
    );
    if (composed && composed.kind === "too-large") {
      throw new SemanticVcsError("ScopeTooLarge", `External text merge exceeds its analysis bound for ${id}`);
    }
    const aspects = entry.aspects.map((item) => composed?.kind === "composed" && item.aspect === "content"
      ? { ...item, status: "composed" as const } : item);
    const status = decision ? "resolved"
      : structural || aspects.some(({ status }) => status === "conflict") ? "conflict"
      : composed?.kind === "composed" || (aspects.some(({ status }) => status === "adopt") &&
          aspects.some(({ status }) => status === "ours")) ? "composed"
      : aspects.some(({ status }) => status === "adopt") ? "adopt" : "convergent";
    return {
      coordinate: { kind: "file", id, paths },
      aspects,
      attribution: { ours: [], theirs: [{ changeId, workUnitId: source.delta.workUnitId }] },
      ...(collision ? { structuralConflicts: [collision], group: canonicalJson(["file", paths.theirs]) } : {}),
      ...(decision ? { decisionId: decision.decisionId } : {}),
      status,
      resolutions: decision ? [] : structural ? ["ours", "current"]
        : status === "composed" ? ["composed", "theirs", "ours", "current"] : ["theirs", "ours", "current"],
      summary: `${status} file ${paths.theirs ?? paths.ours ?? paths.base ?? id}`,
    };
  });
  const intentDecisions = new Map([...decisions].map(([id, decision]) => [canonicalJson(["file", id]), decision]));
  return paginateHistoryComparison(input, source.base, coordinates,
    reviewIntents(sql, { head: source.head, main: source.draft }, coordinates, concluded ? intentDecisions : undefined), concluded);
}
