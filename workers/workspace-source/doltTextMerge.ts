import { canonicalJson, sha256Hex, sha256HexSyncText } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import {
  classifyMergeAspect,
  contentMappingDigest,
  threeWayTextMerge,
  type ContentMapping,
} from "@workspace/vcs-engine";
import { workspaceContentOriginsAt, workspaceEditBasisAt } from "./doltWorkspaceState.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";
import { bytesToBase64 as base64FromBytes } from "@vibestudio/rpc";
import { type MutationDraft, type WorkspaceEditBasis } from "./workspaceMutation.js";

export interface HistoryMergeSelection {
  head: string;
  base: string;
  main: string;
}

export interface HistoryMergeObservation {
  files: readonly { contentHash: string; text: string }[];
}

type PlacedFile = NonNullable<ReturnType<WorkspaceEditBasis["file"]>>;

function unambiguous<T>(aspect: "placement" | "mode" | "path", base: T, ours: T, theirs: T): T | undefined {
  const status = classifyMergeAspect({
    aspect,
    base: canonicalJson(base),
    ours: canonicalJson(ours),
    theirs: canonicalJson(theirs),
  });
  if (status === "conflict") return undefined;
  return status === "adopt" ? theirs : ours;
}

export function historyTextMergeInputs(
  sql: SqlStorage, selection: HistoryMergeSelection, fileId: string,
) {
  const common = workspaceEditBasisAt(sql, selection.base);
  const before = common.file(fileId);
  if (before?.contentKind !== "text") return null;
  const local = workspaceEditBasisAt(sql, selection.head);
  const ours = local.file(fileId);
  if (ours?.contentKind !== "text" || ours.contentHash === before.contentHash) return null;
  const incoming = workspaceEditBasisAt(sql, selection.main);
  const theirs = incoming.file(fileId);
  if (theirs?.contentKind !== "text" || theirs.contentHash === before.contentHash ||
      theirs.contentHash === ours.contentHash) {
    return null;
  }
  const placement = (file: PlacedFile) => ({ repositoryId: file.repositoryId, path: file.path });
  const target = unambiguous("placement", placement(before), placement(ours), placement(theirs));
  const mode = unambiguous("mode", before.mode, ours.mode, theirs.mode);
  if (!target || mode === undefined) return null;
  const { repositoryId } = target;
  const repoPath = unambiguous(
    "path",
    common.repository(repositoryId)?.repoPath ?? null,
    local.repository(repositoryId)?.repoPath ?? null,
    incoming.repository(repositoryId)?.repoPath ?? null,
  );
  if (repoPath == null) return null;
  const localRepoPath = local.repository(ours.repositoryId)?.repoPath;
  if (localRepoPath === undefined) throw new SemanticVcsError("IntegrityFailure", "Text merge file has no repository");
  return { before, ours, theirs, localRepoPath, target: { ...target, mode, repoPath } };
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
  const { before, ours, theirs, localRepoPath, target } = inputs;
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
    repositoryId: target.repositoryId,
    path: target.path,
    mode: target.mode,
    contentHash,
    contentKind: "text" as const,
    byteLength: bytes.length,
    coordinateExtent: merged.text.length,
  };
  const coordinates = (file: PlacedFile | typeof result, repoPath: string) => ({
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
    base: coordinates(ours, localRepoPath),
    result: coordinates(result, target.repoPath),
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
