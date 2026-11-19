import { canonicalJson, compareUtf16CodeUnits, sha256Hex } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import type { VcsCompareInput, VcsExternalDeltaResult, VcsMergeInput } from "@vibestudio/service-schemas/vcs";
import { classifyMergeAspect, contentMappingDigest, threeWayTextMerge, type ContentMapping } from "@workspace/vcs-engine";
import { paginateHistoryComparison, reviewIntents, type HistoryMergeCoordinate, type HistoryMergeReview } from "./doltMergeReview.js";
import { readHistoryMergeObservations, type HistoryMergeObservation } from "./doltTextMerge.js";
import { workspaceContentOriginsAt, workspaceEditBasisAt } from "./doltWorkspaceState.js";
import { workspaceRevertBasisAt } from "./doltWorkspaceRevert.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";
import type { ChangeRecord } from "./semanticVcsStore.js";
import { base64FromBytes, type MutationDraft } from "./semanticWorkspace.js";

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
    `SELECT * FROM dolt_at_gad_changes(?)
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
  const entries = rows.map(({ change_id, base_json, result_json, operation, ordinal, kind, payload_json, effect_digest }) => {
    const before = readEndpoint(base_json, repositoryId);
    const theirs = readEndpoint(result_json, repositoryId);
    const id = (before ?? theirs)?.fileId;
    if (!id || (before && theirs && before.fileId !== theirs.fileId) ||
        typeof change_id !== "string" || typeof effect_digest !== "string" ||
        typeof operation !== "number" || typeof ordinal !== "number" || typeof payload_json !== "string" ||
        (kind !== "file-create" && kind !== "file-delete" && kind !== "file-mode" && kind !== "content-replace")) {
      throw new SemanticVcsError("IntegrityFailure", "External change has no single file identity");
    }
    const change: ChangeRecord = {
      changeId: change_id, effectDigest: effect_digest, workUnitId, operation, ordinal, kind, source: null,
      base: JSON.parse(String(base_json)), result: JSON.parse(String(result_json)), payload: JSON.parse(payload_json),
    };
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
    return { id, paths, before, ours, theirs, change, aspects, collision, structural, textCandidate };
  });
  return { entries, decisions: resolved, concluded: decisions.length > 0 || delta.status === "finalized" };
}

export function analyzeExternalMerge(
  sql: SqlStorage, source: HistoryExternalMergeSource,
  observation: HistoryMergeObservation | null,
  needsText: (fileId: string) => boolean = () => true,
) {
  const { entries, decisions, concluded } = inspectExternalMerge(sql, source);
  const candidates = new Map<string, NonNullable<typeof entries[number]["textCandidate"]>>();
  const selected = new Map<string, number>();
  let total = 0;
  for (const { id, textCandidate } of entries) {
    if (!textCandidate || !needsText(id)) continue;
    const additional = [textCandidate.before, textCandidate.ours, textCandidate.theirs]
      .filter(({ contentHash }) => !selected.has(contentHash));
    const bytes = additional.reduce((count, file) => count + file.byteLength, 0);
    if (total + bytes > 16 * 1024 * 1024) continue;
    for (const { contentHash, byteLength } of additional) selected.set(contentHash, byteLength);
    total += bytes;
    candidates.set(id, textCandidate);
  }
  const hashes = [...selected.keys()].sort(compareUtf16CodeUnits);
  if (hashes.length > 0 && !observation) return { kind: "read-content" as const, contentHashes: hashes };
  const observed = observation ? readHistoryMergeObservations(hashes, observation) : new Map<string, string>();
  const origins = workspaceContentOriginsAt(sql, source.head, entries.flatMap(({ ours }) => ours ? [ours.fileId] : []));
  const compositions = new Map<string, Extract<ReturnType<typeof threeWayTextMerge>, { kind: "composed" }>>();
  const coordinates: HistoryMergeCoordinate[] = entries.map((entry) => {
    const { id, paths, change, collision, structural } = entry;
    const decision = decisions.get(id);
    const candidate = candidates.get(id);
    const origin = origins.get(id);
    const composed = candidate && threeWayTextMerge(
      observed.get(candidate.before.contentHash)!,
      observed.get(candidate.ours.contentHash)!,
      observed.get(candidate.theirs.contentHash)!,
    );
    if (composed?.kind === "composed") compositions.set(id, composed);
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
      attribution: {
        ours: origin?.authoredChangeId && origin.authoredByWorkUnitId
          ? [{ changeId: origin.authoredChangeId, workUnitId: origin.authoredByWorkUnitId }] : [],
        theirs: [{ changeId: change.changeId, workUnitId: source.delta.workUnitId }],
      },
      ...(collision ? { structuralConflicts: [collision], group: canonicalJson(["file", paths.theirs]) } : {}),
      ...(decision ? { decisionId: decision.decisionId } : {}),
      status,
      resolutions: decision ? [] : structural ? ["ours", "current"]
        : status === "composed" ? ["composed", "theirs", "ours", "current"] : ["theirs", "ours", "current"],
      summary: `${status} file ${paths.theirs ?? paths.ours ?? paths.base ?? id}`,
    };
  });
  const intentDecisions = new Map([...decisions].map(([id, decision]) => [canonicalJson(["file", id]), decision]));
  const intents = reviewIntents(sql, { head: source.head, main: source.draft }, coordinates, concluded ? intentDecisions : undefined);
  return { kind: "analyzed" as const, entries, coordinates, compositions, intents, concluded, origins };
}

export function planExternalMerge(
  sql: SqlStorage, source: HistoryExternalMergeSource, input: VcsMergeInput,
  observation: HistoryMergeObservation | null,
) {
  const listed = Array.isArray(input.resolutions) ? input.resolutions : [];
  const blanket = Array.isArray(input.resolutions) ? undefined : input.resolutions?.allRemaining;
  const specified = [...(input.coordinates ?? []), ...listed.map(({ coordinate }) => coordinate)];
  if (specified.some(({ kind }) => kind !== "file")) {
    throw new SemanticVcsError("InvalidReference", "External delta decisions name file placements");
  }
  const chosen = new Set(specified.map(({ id }) => id));
  const resolutions = new Map(listed.map((resolution) => [resolution.coordinate.id, resolution]));
  const choiceFor = (id: string) => resolutions.get(id) ?? blanket;
  const analyzed = analyzeExternalMerge(sql, source, observation, (id) => {
    const choice = choiceFor(id);
    return (!input.coordinates || chosen.has(id)) && (!choice || choice.resolution === "composed");
  });
  if (analyzed.kind === "read-content") return analyzed;
  const { entries, coordinates, compositions, origins } = analyzed;
  const pending = new Map(coordinates.filter(({ status }) => status !== "resolved").map((entry) => [entry.coordinate.id, entry]));
  for (const id of chosen) {
    if (!pending.has(id)) throw new SemanticVcsError("InvalidReference", `External file ${id} is not pending`);
  }
  if (!input.coordinates) {
    for (const { coordinate, status } of pending.values()) {
      if (chosen.size >= 500) break;
      if (blanket || status !== "conflict") chosen.add(coordinate.id);
    }
  }
  const decision: NonNullable<MutationDraft["decisions"]>[number] = {
    targetState: input.expectedWorkingHead, sourceEventId: null, sourceDeltaId: source.delta.deltaId, entries: [],
  };
  const draft: MutationDraft = {
    kind: "merge", intentSummary: input.intentSummary ?? null, changes: [], fileResults: [], repositoryResults: [],
    incorporatedChangeIds: [], appliedSourceChanges: [], contentDerivations: [], blobs: [], decisions: [decision],
  };
  const basis = workspaceEditBasisAt(sql, source.head);
  const revertBasis = workspaceRevertBasisAt(sql, source.head);
  const endpoints = new Map(entries.map((entry) => [entry.id, entry]));
  for (const id of chosen) {
    const record = pending.get(id)!;
    const choice = choiceFor(id);
    if (record.status === "conflict" && !choice) {
      throw new SemanticVcsError("ConflictPresent", "Selected external placements require a resolution", { coordinates: [record] });
    }
    if (choice && !record.resolutions.includes(choice.resolution)) {
      throw new SemanticVcsError("InvalidReference", `Resolution ${choice.resolution} is unavailable for file ${id}`);
    }
    const { ours, theirs, change } = endpoints.get(id)!;
    const requested = choice?.resolution;
    const kept = requested === "ours" || requested === "current";
    const entry: typeof decision.entries[number] = {
      coordinate: { kind: "file", id },
      resolution: kept ? requested : record.status === "convergent" ? "convergent"
        : requested !== "theirs" && record.status === "composed" ? "composed" : "adopt",
      accountedSourceChangeIds: [change.changeId], rationale: choice?.rationale ?? null,
    };
    decision.entries.push(entry);
    draft.incorporatedChangeIds.push(change.changeId);
    if (kept || record.status === "convergent") continue;

    const composed = requested === "theirs" ? undefined : compositions.get(id);
    const adopt = (aspect: "mode" | "placement" | "content") => requested === "theirs" ||
      record.aspects.some((entry) => entry.aspect === aspect && entry.status === "adopt");
    let result = theirs;
    if (ours && theirs && requested !== "theirs") {
      const contents = adopt("content") ? theirs : ours;
      const placement = adopt("placement") ? theirs : ours;
      result = { ...contents, repositoryId: placement.repositoryId, path: placement.path, mode: adopt("mode") ? theirs.mode : ours.mode };
    }
    if (result && composed) {
      const bytes = new TextEncoder().encode(composed.text);
      const contentHash = sha256Hex(bytes);
      result = { ...result, contentHash, byteLength: bytes.length, coordinateExtent: composed.text.length, contentKind: "text" };
      draft.blobs!.push({ contentHash, base64: base64FromBytes(bytes) });
    }
    const endpoint = (file: File | null) => {
      if (!file) return { kind: "missing", fileId: id, repositoryId: source.delta.repositoryId, repoPath: source.delta.repoPath };
      const repo = basis.repository(file.repositoryId);
      if (!repo) throw new SemanticVcsError("InvalidReference", "Merged external placement has no repository");
      const { fileId, repositoryId, path, mode, contentHash, contentKind, byteLength, coordinateExtent } = file;
      return { kind: "file", fileId, repositoryId, path, repoPath: repo.repoPath, mode, contentHash, contentKind, byteLength, coordinateExtent };
    };
    const expected = revertBasis.file(id)?.state ?? null;
    const changeRef = { kind: "authored" as const, ordinal: draft.changes.length };
    draft.changes.push({ operation: changeRef.ordinal, ordinal: 0, kind: "merge", base: endpoint(ours), result: endpoint(result),
      payload: { mergesChangeIds: [change.changeId, ...record.attribution.ours.map(({ changeId }) => changeId)] } });
    if (result || ours) {
      draft.fileResults.push({ fileId: id, expected, changeRef, newFile: expected === null,
        result: result ? { ...result, presence: "placed" } : { fileId: id, presence: "deleted", priorFileStateId: ours!.fileStateId } });
    }
    entry.resultChangeRef = changeRef;
    if (!result || !theirs) continue;
    const asMappings = (values: ReadonlyArray<Pick<ContentMapping, "childStart" | "childEnd" | "parentStart" | "parentEnd">>, parent: File) =>
      values.map((mapping) => {
        const fields = { ...mapping, coordinateKind: result.contentKind === "text" ? "utf16" as const : "byte" as const,
          childContentHash: result.contentHash, parentContentHash: parent.contentHash };
        return { ...fields, digest: contentMappingDigest(fields) };
      });
    const imported = result.contentHash === theirs.contentHash;
    if (composed || imported) {
      draft.appliedSourceChanges!.push(change);
      const mappings = composed ? composed.theirsMappings : result.coordinateExtent > 0 ?
        [{ childStart: 0, childEnd: result.coordinateExtent, parentStart: 0, parentEnd: theirs.coordinateExtent }] : [];
      draft.contentDerivations!.push({ childChangeRef: changeRef, parent: { kind: "change", changeRef: { kind: "existing", changeId: change.changeId } },
        mappings: asMappings(mappings, theirs) });
    }
    if (composed && ours) {
      const origin = origins.get(id);
      if (!origin || origin.content?.contentHash !== ours.contentHash) {
        throw new SemanticVcsError("IntegrityFailure", "Composed external file lacks its local content origin");
      }
      draft.contentDerivations!.push({ childChangeRef: changeRef, parent: { kind: "origin", origin: origin.ref },
        mappings: asMappings(composed.oursMappings, ours) });
    }
  }
  return { ...analyzed, kind: "planned" as const, draft, chosen };
}

export function reviewExternalMerge(
  sql: SqlStorage, input: VcsCompareInput, source: HistoryExternalMergeSource,
  observation: HistoryMergeObservation | null,
): HistoryMergeReview {
  const result = analyzeExternalMerge(sql, source, observation);
  if (result.kind === "read-content") return result;
  return paginateHistoryComparison(input, source.base, result.coordinates, result.intents, result.concluded);
}
