import { canonicalJson, sha256Hex, sha256HexSyncText } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import {
  contentMappingDigest,
  threeWayTextMerge,
  type ContentMapping,
} from "@workspace/vcs-engine";
import { workspaceContentOriginsAt, workspaceEditBasisAt } from "./doltWorkspaceState.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";
import { base64FromBytes, type MutationDraft, type WorkspaceEditBasis } from "./semanticWorkspace.js";

export interface HistoryMergeSelection {
  head: string;
  base: string;
  main: string;
}

export interface HistoryMergeObservation {
  files: readonly { contentHash: string; text: string }[];
}

type PlacedFile = NonNullable<ReturnType<WorkspaceEditBasis["file"]>>;

export function historyTextMergeInputs(
  sql: SqlStorage, selection: HistoryMergeSelection, fileId: string,
) {
  const before = workspaceEditBasisAt(sql, selection.base).file(fileId);
  if (before?.contentKind !== "text") return null;
  const local = workspaceEditBasisAt(sql, selection.head);
  const ours = local.file(fileId);
  if (ours?.contentKind !== "text" || ours.contentHash === before.contentHash) return null;
  const theirs = workspaceEditBasisAt(sql, selection.main).file(fileId);
  if (theirs?.contentKind !== "text" || theirs.contentHash === before.contentHash ||
      theirs.contentHash === ours.contentHash) {
    return null;
  }
  const placement = (file: PlacedFile) => canonicalJson([file.repositoryId, file.path, file.mode]);
  if (placement(before) !== placement(ours) || placement(ours) !== placement(theirs)) {
    return null;
  }
  const repository = local.repository(ours.repositoryId);
  if (!repository) throw new SemanticVcsError("IntegrityFailure", "Text merge file has no repository");
  return { before, ours, theirs, repoPath: repository.repoPath };
}

export function readHistoryMergeObservations(
  hashes: readonly string[],
  observation: HistoryMergeObservation,
): Map<string, string> {
  const expected = new Set(hashes);
  const observed = new Map<string, string>();
  for (const file of observation.files) {
    if (typeof file.text !== "string" || !expected.has(file.contentHash) || observed.has(file.contentHash) ||
        new TextDecoder("utf-8", { ignoreBOM: true }).decode(new TextEncoder().encode(file.text)) !== file.text ||
        sha256HexSyncText(file.text) !== file.contentHash) {
      throw new SemanticVcsError("IntegrityFailure", "Text merge observation changed its content digest");
    }
    observed.set(file.contentHash, file.text);
  }
  if (observed.size !== expected.size) {
    throw new SemanticVcsError("IntegrityFailure", "Text merge observation is incomplete");
  }
  return observed;
}

/** Compute the exact placement and content derivation for one compatible text conflict. */
export function composeHistoryText(
  sql: SqlStorage,
  selection: HistoryMergeSelection,
  inputs: NonNullable<ReturnType<typeof historyTextMergeInputs>>,
  observed: ReadonlyMap<string, string>,
  ordinal: number,
  sourceChangeIds: readonly string[],
) {
  const { before, ours, theirs, repoPath } = inputs;
  const { fileId } = ours;
  const text = (file: PlacedFile) => {
    const value = observed.get(file.contentHash);
    if (value === undefined || value.length !== file.coordinateExtent) {
      throw new SemanticVcsError("IntegrityFailure", `Text merge lost its exact file content for ${fileId}`);
    }
    return value;
  };
  const merged = threeWayTextMerge(text(before), text(ours), text(theirs));
  if (merged.kind === "too-large") {
    throw new SemanticVcsError("ScopeTooLarge", `Text merge exceeds its analysis bound for ${fileId}`);
  }
  if (merged.kind !== "composed") return null;

  const localOrigin = workspaceContentOriginsAt(sql, selection.head, [fileId]).get(fileId);
  const sourceOrigin = workspaceContentOriginsAt(sql, selection.main, [fileId]).get(fileId);
  if (localOrigin?.content?.contentHash !== ours.contentHash || sourceOrigin?.content?.contentHash !== theirs.contentHash) {
    throw new SemanticVcsError("IntegrityFailure", `Text merge has incomplete file lineage for ${fileId}`);
  }
  const bytes = new TextEncoder().encode(merged.text);
  const contentHash = sha256Hex(bytes);
  const result = {
    presence: "placed" as const,
    fileId,
    repositoryId: ours.repositoryId,
    path: ours.path,
    mode: ours.mode,
    contentHash,
    contentKind: "text" as const,
    byteLength: bytes.length,
    coordinateExtent: merged.text.length,
  };
  const coordinates = (file: PlacedFile | typeof result) => ({
    kind: "file",
    fileId,
    repoPath,
    repositoryId: file.repositoryId,
    path: file.path,
    mode: file.mode,
    contentHash: file.contentHash,
    contentKind: file.contentKind,
    byteLength: file.byteLength,
    coordinateExtent: file.coordinateExtent,
  });
  const changeRef = { kind: "authored" as const, ordinal };
  const derivation = (origin: typeof localOrigin, mappings: typeof merged.oursMappings, parentContentHash: string) => ({
    childChangeRef: changeRef,
    parent: { kind: "origin" as const, origin: origin.ref },
    mappings: mappings.map((mapping): ContentMapping => {
      const payload = { ...mapping, coordinateKind: "utf16" as const, childContentHash: contentHash, parentContentHash };
      return { ...payload, digest: contentMappingDigest(payload) };
    }),
  });
  const change: MutationDraft["changes"][number] = {
    kind: "merge",
    operation: ordinal,
    ordinal: 0,
    base: coordinates(ours),
    result: coordinates(result),
    payload: { mergesChangeIds: [...new Set([
      ...sourceChangeIds,
      ...(localOrigin.authoredChangeId ? [localOrigin.authoredChangeId] : []),
    ])] },
  };
  const file: MutationDraft["fileResults"][number] = {
    fileId, result, expected: ours, newFile: false, changeRef,
  };
  return {
    change, file,
    blob: { contentHash, base64: base64FromBytes(bytes) },
    localOrigin, sourceOrigin,
    derivations: [
      derivation(localOrigin, merged.oursMappings, ours.contentHash),
      derivation(sourceOrigin, merged.theirsMappings, theirs.contentHash),
    ],
  };
}
