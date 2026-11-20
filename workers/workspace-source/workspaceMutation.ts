import {
  canonicalSnapshotDigest,
  compareUtf16CodeUnits,
  sha256Hex,
} from "@vibestudio/content-addressing";
import {
  type VcsCopyInput,
  type VcsEditInput,
  type VcsExternalSnapshot,
  type VcsImportSnapshotInput,
  type VcsRegisterExternalDeltaInput,
  type VcsMoveInput,
  type VcsRevertInput,
  type VcsStateNodeRef,
} from "@vibestudio/service-schemas/vcs";
import {
  NORMALIZATION_PROTOCOL,
  SEMANTIC_PROTOCOL,
  compactId,
  workspaceFileStateIdentity,
  type ContentMapping,
  type StateNodeRef,
  type WorkspaceFileState,
  type WorkspaceRepositoryMember,
} from "@workspace/vcs-engine";
import { assertSemanticVcsPathAdmissible } from "@vibestudio/shared/vcs/pathAdmission";
import {
  appliedChangeIdentity,
  applicationIdentity,
  changeIdentity,
  contentEdgeIdentity,
  decisionIdentity,
  workUnitIdentity,
  type ApplicationPersistencePlan,
  type ApplicationRecord,
  type AppliedChangeRecord,
  type AuthoredCopySourceEndpoint,
  type ChangeRecord,
  type ContentEdgeRecord,
  type ContentOriginRef,
  type IntegrationDecisionRecord,
  type StatePredicateRecord,
  type WorkUnitRecord,
  type ExternalDeltaRecord,
} from "./semanticHistoryRecords.js";
import {
  base64ToBytes as bytesFromBase64,
  bytesToBase64 as base64FromBytes,
} from "@vibestudio/rpc";
import {
  SemanticVcsError,
  internalSemanticIntegrityFailure,
} from "./semanticVcsErrors.js";
import { stateNodeKey } from "./semanticProvenanceWriter.js";
import { contentMapping } from "./contentBlame.js";
import {
  type ContentEndpoint,
  type FileContentOrigin,
  contentEndpoint,
  coordinateKindForFile,
} from "./workspaceHistoryReads.js";

type Row = Record<string, unknown>;

export type PlacedFileState = Extract<
  WorkspaceFileState,
  { presence: "placed" }
>;

export type PresentRepositoryState = Extract<
  WorkspaceRepositoryMember,
  { presence: "present" }
>;

type RepositoryPlacement = Pick<
  PresentRepositoryState,
  "repositoryId" | "repoPath"
>;

/** Placement reads pinned to the edit's exact expected working revision. */
export interface WorkspaceEditBasis {
  file(fileId: string): PlacedFileState | null;
  repository(repositoryId: string): RepositoryPlacement | null;
  repositoryAtPath(path: string): { repositoryId: string } | null;
  emptyRepository(
    repository: RepositoryPlacement,
  ): PresentRepositoryState | null;
  hasFileAtPath(repositoryId: string, path: string): boolean;
}

export interface WorkspaceRevertBasis {
  change(changeId: string): ChangeRecord;
  repository(repositoryId: string): WorkspaceRepositoryMember | null;
  priorRepository(
    repository: Extract<WorkspaceRepositoryMember, { presence: "deleted" }>,
  ): WorkspaceRepositoryMember | null;
  manifest(
    repository: PresentRepositoryState,
    manifestId: string,
  ): {
    values: readonly { fileId: string }[];
    next: unknown | null;
  };
  file(fileId: string): { state: WorkspaceFileState } | null;
  blockingChanges(change: ChangeRecord): readonly string[];
  latestFileChange(fileId: string): { changeId: string } | null;
}

export interface WorkspaceSnapshotImportBasis {
  repository(repositoryId: string): WorkspaceRepositoryMember | null;
  files(
    repository: PresentRepositoryState,
  ): ReadonlyMap<string, PlacedFileState>;
}

export function snapshotImportTarget(
  repository: WorkspaceRepositoryMember | null,
  repositoryId: string,
  repoPath: string,
): PresentRepositoryState {
  if (!repository || repository.presence !== "present") {
    throw new SemanticVcsError(
      "InvalidReference",
      `Snapshot replacement requires a present repository ${repositoryId}`,
    );
  }
  if (repository.repoPath !== repoPath) {
    throw new SemanticVcsError(
      "InvalidReference",
      `Snapshot import cannot move repository ${repositoryId}; use vcs.move first`,
    );
  }
  return repository;
}

export interface WorkspaceTransferBasis {
  placedFile(
    repositoryId: string,
    fileId: string,
  ): { state: PlacedFileState; repository: RepositoryPlacement };
  repositoryPlacement(repositoryId: string): RepositoryPlacement;
  presentRepository(repositoryId: string): PresentRepositoryState;
  fileAtPath(repositoryId: string, path: string): PlacedFileState | null;
  repositoryAtPath(path: string): { repositoryId: string } | null;
}

export const stateFileKey = (state: StateNodeRef, fileId: string): string =>
  `${stateNodeKey(state)}\0${fileId}`;

export interface FileTransition {
  fileId: string;
  expected: WorkspaceFileState | null;
  result: WorkspaceFileState;
  changeId: string;
  /** This work authors the global file identity, not merely a placement in this state. */
  newFile: boolean;
}

export interface RepositoryTransition {
  repositoryId: string;
  expected: WorkspaceRepositoryMember | null;
  /** `undefined` preserves the member while files change; `null` deletes it. */
  resultPath: string | null | undefined;
  changeId: string | null;
  tombstoneChangeId: string | null;
  /** This work authors the global repository identity, not merely membership in this state. */
  newRepository: boolean;
}

interface MutationPreparation<Placement> {
  now(): string;
  workUnitEvidence(
    contextId: string,
    commandId: string,
  ): Pick<WorkUnitRecord, "authorContextId" | "triggerEvidence">;
  contentIntegrity(
    basis: StateNodeRef,
    draft: MutationDraft,
  ): MutationContentIntegrity;
  contentOrigins(
    state: StateNodeRef,
    fileIds: readonly string[],
  ): Map<string, FileContentOrigin>;
  invertedCounteractions(
    changeIds: readonly string[],
    child: ContentEndpoint,
    parent: ContentEndpoint,
  ): ContentMapping[];
  preparePlacement(
    files: readonly FileTransition[],
    repositories: readonly RepositoryTransition[],
  ): {
    placement: Placement;
    resultRoot: string;
    workspacePlanCompletedAt: number;
  };
}

export type MutationContentIntegrity = {
  class: "internal" | "external";
  externalKeys: string[];
  contentOrigins: Map<string, FileContentOrigin>;
};

export type DraftChangeRef =
  | { kind: "authored"; ordinal: number }
  | { kind: "existing"; changeId: string };

export interface MutationDraft {
  kind: WorkUnitRecord["kind"];
  intentSummary: string | null;
  externalSnapshot?: {
    sourceKind: VcsImportSnapshotInput["source"]["kind"];
    sourceUri: string;
    snapshotRevision: string;
    sourceSubdir?: string | null;
    canonicalSnapshot?: string;
    snapshotDigest: string;
    targetRepositoryIds: readonly string[];
  };
  incorporatedChangeIds: string[];
  changes: Array<
    Omit<
      ChangeRecord,
      "changeId" | "workUnitId" | "effectDigest" | "source"
    > & {
      source?: AuthoredCopySourceEndpoint;
    }
  >;
  fileResults: Array<{
    fileId: string;
    expected: WorkspaceFileState | null;
    result:
      | Omit<Extract<WorkspaceFileState, { presence: "placed" }>, "fileStateId">
      | {
          fileId: string;
          presence: "deleted";
          priorFileStateId: string;
        };
    /** This work authors the global identity; adopted source identities are never new here. */
    newFile: boolean;
    changeRef: DraftChangeRef;
  }>;
  repositoryResults: Array<{
    repositoryId: string;
    expected: WorkspaceRepositoryMember | null;
    resultPath: string | null;
    /** This work authors the global identity; adopted source identities are never new here. */
    newRepository: boolean;
    changeRef: DraftChangeRef | null;
  }>;
  appliedSourceChanges?: ChangeRecord[];
  contentEdges?: ContentEdgeRecord[];
  contentDerivations?: Array<{
    childChangeRef: DraftChangeRef;
    parent:
      | { kind: "origin"; origin: ContentOriginRef }
      | { kind: "change"; changeRef: DraftChangeRef };
    mappings: ContentMapping[];
  }>;
  decisions?: Array<
    Omit<
      IntegrationDecisionRecord,
      "decisionId" | "workUnitId" | "createdAt" | "entries"
    > & {
      entries: Array<
        Omit<IntegrationDecisionRecord["entries"][number], "resultChangeId"> & {
          resultChangeRef?: DraftChangeRef;
        }
      >;
    }
  >;
  blobs?: Array<{ contentHash: string; base64: string }>;
}

export const asState = (value: VcsStateNodeRef): StateNodeRef =>
  value.kind === "event"
    ? { kind: "event", eventId: value.eventId }
    : { kind: "application", applicationId: value.applicationId };

const contentBytes = (
  value: { kind: "text"; text: string } | { kind: "bytes"; base64: string },
) =>
  value.kind === "text"
    ? new TextEncoder().encode(value.text)
    : bytesFromBase64(value.base64);

const contentDescriptor = (
  value: { kind: "text"; text: string } | { kind: "bytes"; base64: string },
  bytes: Uint8Array,
): Pick<PlacedFileState, "contentKind" | "byteLength" | "coordinateExtent"> =>
  value.kind === "text"
    ? {
        contentKind: "text",
        byteLength: bytes.length,
        coordinateExtent: value.text.length,
      }
    : {
        contentKind: "bytes",
        byteLength: bytes.length,
        coordinateExtent: bytes.length,
      };

export const contentDescriptorFromEndpoint = (
  endpoint: Row,
): Pick<PlacedFileState, "contentKind" | "byteLength" | "coordinateExtent"> => {
  const contentKind = endpoint["contentKind"];
  const byteLength = endpoint["byteLength"];
  const coordinateExtent = endpoint["coordinateExtent"];
  if (
    (contentKind !== "text" && contentKind !== "bytes") ||
    !Number.isSafeInteger(byteLength) ||
    Number(byteLength) < 0 ||
    !Number.isSafeInteger(coordinateExtent) ||
    Number(coordinateExtent) < 0 ||
    (contentKind === "bytes" && coordinateExtent !== byteLength)
  ) {
    throw new SemanticVcsError(
      "IntegrityFailure",
      "File endpoint has invalid coordinate metadata",
    );
  }
  return {
    contentKind,
    byteLength: Number(byteLength),
    coordinateExtent: Number(coordinateExtent),
  };
};

export const endpointForFile = (
  state: PlacedFileState,
  repository: Pick<RepositoryPlacement, "repoPath">,
): Row => ({
  kind: "file",
  fileId: state.fileId,
  repositoryId: state.repositoryId,
  repoPath: repository.repoPath,
  path: state.path,
  contentHash: state.contentHash,
  mode: state.mode,
  contentKind: state.contentKind,
  byteLength: state.byteLength,
  coordinateExtent: state.coordinateExtent,
});

const missingEndpoint = (
  state: Pick<PlacedFileState, "fileId" | "repositoryId" | "path">,
  repoPath: string,
): Row => ({
  kind: "missing",
  fileId: state.fileId,
  repositoryId: state.repositoryId,
  repoPath,
  path: state.path,
});

export const mappingForWholeFile = (input: {
  childContentHash: string;
  parentContentHash: string;
  coordinateKind: "utf16" | "byte";
  coordinateExtent: number;
}): ContentMapping => {
  return contentMapping({
    coordinateKind: input.coordinateKind,
    childContentHash: input.childContentHash,
    childStart: 0,
    childEnd: input.coordinateExtent,
    parentContentHash: input.parentContentHash,
    parentStart: 0,
    parentEnd: input.coordinateExtent,
  });
};

const mappingsForTextEdits = (input: {
  childContentHash: string;
  childExtent: number;
  parentContentHash: string;
  parentExtent: number;
  edits: unknown;
}): ContentMapping[] => {
  if (!Array.isArray(input.edits)) {
    throw new SemanticVcsError(
      "IntegrityFailure",
      "Text change has no exact edit spans",
    );
  }
  const mappings: ContentMapping[] = [];
  let parentCursor = 0;
  let childCursor = 0;
  for (const candidate of input.edits) {
    if (typeof candidate !== "object" || candidate === null) {
      throw new SemanticVcsError(
        "IntegrityFailure",
        "Text change has an invalid edit span",
      );
    }
    const edit = candidate as {
      start?: unknown;
      end?: unknown;
      insertedExtent?: unknown;
    };
    if (
      !Number.isSafeInteger(edit.start) ||
      !Number.isSafeInteger(edit.end) ||
      !Number.isSafeInteger(edit.insertedExtent) ||
      Number(edit.insertedExtent) < 0 ||
      Number(edit.start) < parentCursor ||
      Number(edit.end) < Number(edit.start) ||
      Number(edit.end) > input.parentExtent
    ) {
      throw new SemanticVcsError(
        "IntegrityFailure",
        "Text change has an invalid edit span",
      );
    }
    const start = Number(edit.start);
    const end = Number(edit.end);
    const unchangedLength = start - parentCursor;
    if (unchangedLength > 0) {
      mappings.push(
        contentMapping({
          coordinateKind: "utf16",
          childContentHash: input.childContentHash,
          childStart: childCursor,
          childEnd: childCursor + unchangedLength,
          parentContentHash: input.parentContentHash,
          parentStart: parentCursor,
          parentEnd: start,
        }),
      );
    }
    childCursor += unchangedLength + Number(edit.insertedExtent);
    parentCursor = end;
  }
  const tailLength = input.parentExtent - parentCursor;
  if (tailLength > 0) {
    mappings.push(
      contentMapping({
        coordinateKind: "utf16",
        childContentHash: input.childContentHash,
        childStart: childCursor,
        childEnd: childCursor + tailLength,
        parentContentHash: input.parentContentHash,
        parentStart: parentCursor,
        parentEnd: input.parentExtent,
      }),
    );
    childCursor += tailLength;
  }
  if (childCursor !== input.childExtent) {
    throw new SemanticVcsError(
      "IntegrityFailure",
      "Text edit mappings do not cover the result",
    );
  }
  return mappings;
};

export const predicateForState = (
  state: WorkspaceFileState,
): StatePredicateRecord =>
  state.presence === "placed"
    ? {
        kind: "file-content",
        fileId: state.fileId,
        contentHash: state.contentHash,
      }
    : { kind: "file-absent", fileId: state.fileId };

const inverseChangeKind = (
  kind: string,
  endpoint?: Row | null,
): string | null => {
  switch (kind) {
    case "file-create":
    case "file-copy":
    case "file-restore":
      return "file-delete";
    case "file-delete":
      return "file-restore";
    case "repo-add":
    case "repo-restore":
      return "repo-delete";
    case "repo-delete":
      return "repo-restore";
    // A synthesized merge records exact before/after coordinates too. Its
    // counteraction restores that endpoint, preserving unrelated local aspects.
    case "merge":
      return endpoint?.["kind"] === "repository" ? "repo-move" : "merge";
    case "text":
    case "file-move":
    case "file-mode":
    case "content-replace":
    case "repo-move":
      return kind;
    default:
      return null;
  }
};

type ObservedContentDescriptor = {
  contentKind: "text" | "bytes";
  byteLength: number;
  coordinateExtent: number;
};

const importedSnapshotDigest = (
  repositories: VcsImportSnapshotInput["repositories"],
  observed: ReadonlyMap<string, ObservedContentDescriptor>,
): string =>
  compactId(
    "snapshot",
    repositories
      .map((repository) => ({
        repoPath: repository.repoPath,
        files: repository.files
          .map((file) => {
            const descriptor = observed.get(file.contentHash);
            if (!descriptor) {
              throw internalSemanticIntegrityFailure(
                "EffectMismatch",
                `Content observation lacks ${file.contentHash}`,
                {
                  contentHash: file.contentHash,
                  contract: "import-observation",
                },
              );
            }
            return {
              path: file.path,
              contentHash: file.contentHash,
              mode: file.mode,
              ...descriptor,
            };
          })
          .sort((left, right) => compareUtf16CodeUnits(left.path, right.path)),
      }))
      .sort((left, right) =>
        compareUtf16CodeUnits(left.repoPath, right.repoPath),
      ),
  );

export const importedRepositories = (input: VcsImportSnapshotInput) =>
  input.repositories.map((repository, ordinal) => ({
    input: repository,
    repositoryId:
      repository.repositoryId ??
      compactId("repository", {
        commandId: input.commandId,
        ordinal,
        repoPath: repository.repoPath,
      }),
  }));

/** Resolve the content a text edit needs from its pinned placement, before accepting bytes. */
export function editContentHashes(
  input: VcsEditInput,
  basis: WorkspaceEditBasis,
): string[] {
  const hashes = new Set<string>();
  for (const change of input.changes) {
    if (change.kind !== "text-edit") continue;
    const file = basis.file(change.fileId);
    if (!file || file.repositoryId !== change.repositoryId) {
      throw new SemanticVcsError(
        "InvalidReference",
        `Unknown file ${change.fileId}`,
      );
    }
    if (file.contentKind !== "text") {
      throw new SemanticVcsError(
        "InvalidReference",
        `Text edit requires text content for ${change.fileId}`,
        { referenceKind: "text-file", reference: change.fileId },
      );
    }
    hashes.add(file.contentHash);
  }
  return [...hashes].sort(compareUtf16CodeUnits);
}

export function planEdit(
  input: VcsEditInput,
  receipt: Row | null,
  basis: WorkspaceEditBasis,
): MutationDraft {
  const observed = new Map<string, Uint8Array>();
  if (receipt) {
    const expectedContentHashes = new Set(editContentHashes(input, basis));
    const rows = receipt["files"];
    if (!Array.isArray(rows)) {
      throw internalSemanticIntegrityFailure(
        "EffectMismatch",
        "Content observation lacks files",
        { contract: "edit-observation" },
      );
    }
    for (const value of rows) {
      if (!value || typeof value !== "object") {
        throw internalSemanticIntegrityFailure(
          "EffectMismatch",
          "Content observation contains an invalid file",
          { contract: "edit-observation" },
        );
      }
      const record = value as Row;
      const contentHash = String(record["contentHash"] ?? "");
      if (
        !expectedContentHashes.has(contentHash) ||
        observed.has(contentHash)
      ) {
        throw internalSemanticIntegrityFailure(
          "EffectMismatch",
          `Content observation contains an unexpected or duplicate digest ${contentHash}`,
          { contentHash, contract: "edit-observation" },
        );
      }
      const base64 = String(record["base64"] ?? "");
      const bytes = bytesFromBase64(base64);
      if (sha256Hex(bytes) !== contentHash) {
        throw internalSemanticIntegrityFailure(
          "EffectMismatch",
          `Observed content differs for ${contentHash}`,
          { contentHash, contract: "edit-observation" },
        );
      }
      observed.set(contentHash, bytes);
    }
    if (observed.size !== expectedContentHashes.size) {
      throw internalSemanticIntegrityFailure(
        "EffectMismatch",
        "Content observation is incomplete",
        { contract: "edit-observation" },
      );
    }
  }

  const changes: MutationDraft["changes"] = [];
  const fileResults: MutationDraft["fileResults"] = [];
  const repositoryResults: MutationDraft["repositoryResults"] = [];
  const blobs: NonNullable<MutationDraft["blobs"]> = [];
  const touched = new Set<string>();
  input.changes.forEach((change, operation) => {
    if (change.kind === "repository-create") {
      const occupied = basis.repositoryAtPath(change.repoPath);
      if (occupied) {
        throw new SemanticVcsError(
          "DestinationOccupied",
          `Repository destination ${change.repoPath} is occupied`,
          { repositoryId: occupied.repositoryId, path: change.repoPath },
        );
      }
      const repositoryId = compactId("repository", {
        commandId: input.commandId,
        operation,
        repoPath: change.repoPath,
      });
      const repositoryChangeIndex = changes.length;
      changes.push({
        operation,
        ordinal: 0,
        kind: "repo-add",
        base: null,
        result: {
          kind: "repository",
          repositoryId,
          repoPath: change.repoPath,
        },
        payload: { repoPath: change.repoPath },
      });
      repositoryResults.push({
        repositoryId,
        expected: null,
        resultPath: change.repoPath,
        newRepository: true,
        changeRef: { kind: "authored", ordinal: repositoryChangeIndex },
      });
      change.files.forEach((file, fileIndex) => {
        assertSemanticVcsPathAdmissible(file.path);
        const bytes = contentBytes(file.content);
        const contentHash = sha256Hex(bytes);
        const fileId = compactId("file", {
          commandId: input.commandId,
          operation,
          repositoryId,
          path: file.path,
        });
        const result = {
          fileId,
          presence: "placed" as const,
          repositoryId,
          path: file.path,
          contentHash,
          mode: file.mode,
          ...contentDescriptor(file.content, bytes),
        };
        const fileChangeIndex = changes.length;
        changes.push({
          operation,
          ordinal: fileIndex + 1,
          kind: "file-create",
          base: missingEndpoint(result, change.repoPath),
          result: { kind: "file", ...result, repoPath: change.repoPath },
          payload: { path: file.path, mode: file.mode },
        });
        fileResults.push({
          fileId,
          expected: null,
          result,
          newFile: true,
          changeRef: { kind: "authored", ordinal: fileChangeIndex },
        });
        blobs.push({ contentHash, base64: base64FromBytes(bytes) });
      });
      return;
    }
    if ("fileId" in change && touched.has(change.fileId)) {
      throw new SemanticVcsError(
        "RevisionChanged",
        `File ${change.fileId} is edited twice`,
      );
    }
    if ("fileId" in change) touched.add(change.fileId);
    const repository = basis.repository(change.repositoryId);
    if (!repository) {
      throw new SemanticVcsError(
        "InvalidReference",
        `Unknown repository ${change.repositoryId}`,
      );
    }
    if (change.kind === "repository-delete") {
      if (repository.repoPath === "meta")
        throw new SemanticVcsError(
          "InvalidReference",
          "The workspace metadata repository cannot be removed",
        );
      const empty = basis.emptyRepository(repository);
      if (!empty)
        throw new SemanticVcsError(
          "InvalidReference",
          "Resolve contained file changes before removing a repository",
        );
      const ordinal = changes.length;
      changes.push({
        operation,
        ordinal: 0,
        kind: "repo-delete",
        base: {
          kind: "repository",
          repositoryId: change.repositoryId,
          repoPath: repository.repoPath,
          fileManifestId: empty.fileManifestId,
        },
        result: {
          kind: "repository",
          repositoryId: change.repositoryId,
          presence: "deleted",
        },
        payload: { repoPath: repository.repoPath },
      });
      repositoryResults.push({
        repositoryId: change.repositoryId,
        expected: empty,
        resultPath: null,
        newRepository: false,
        changeRef: { kind: "authored", ordinal },
      });
      return;
    }
    if (change.kind === "file-create") {
      assertSemanticVcsPathAdmissible(change.path);
      if (basis.hasFileAtPath(change.repositoryId, change.path)) {
        throw new SemanticVcsError(
          "DestinationOccupied",
          `Destination ${change.path} is occupied`,
          { repositoryId: change.repositoryId, path: change.path },
        );
      }
      const bytes = contentBytes(change.content);
      const contentHash = sha256Hex(bytes);
      const fileId = compactId("file", {
        commandId: input.commandId,
        operation,
        repositoryId: change.repositoryId,
        path: change.path,
      });
      const result = {
        fileId,
        presence: "placed" as const,
        repositoryId: change.repositoryId,
        path: change.path,
        contentHash,
        mode: change.mode,
        ...contentDescriptor(change.content, bytes),
      };
      const resultEndpoint: Row = {
        kind: "file",
        ...result,
        repoPath: repository.repoPath,
      };
      changes.push({
        operation,
        ordinal: 0,
        kind: "file-create",
        base: missingEndpoint(result, repository.repoPath),
        result: resultEndpoint,
        payload: { path: change.path, mode: change.mode },
      });
      fileResults.push({
        fileId,
        expected: null,
        result,
        newFile: true,
        changeRef: { kind: "authored", ordinal: operation },
      });
      blobs.push({ contentHash, base64: base64FromBytes(bytes) });
      return;
    }
    const file = basis.file(change.fileId);
    if (!file || file.repositoryId !== change.repositoryId) {
      throw new SemanticVcsError(
        "InvalidReference",
        `Unknown file ${change.fileId}`,
      );
    }
    const point = { state: file, repository };
    const base = endpointForFile(point.state, point.repository);
    if (change.kind === "file-delete") {
      changes.push({
        operation,
        ordinal: 0,
        kind: "file-delete",
        base,
        result: missingEndpoint(point.state, repository.repoPath),
        payload: change as unknown as Row,
      });
      fileResults.push({
        fileId: change.fileId,
        expected: point.state,
        result: {
          fileId: change.fileId,
          presence: "deleted",
          priorFileStateId: point.state.fileStateId,
        },
        newFile: false,
        changeRef: { kind: "authored", ordinal: operation },
      });
      return;
    }
    let bytes: Uint8Array | null = null;
    let result: Omit<PlacedFileState, "fileStateId">;
    const { fileStateId: _priorFileStateId, ...prior } = point.state;
    if (change.kind === "file-mode") {
      result = { ...prior, mode: change.mode };
    } else if (change.kind === "content-replace") {
      bytes = contentBytes(change.content);
      result = {
        ...prior,
        contentHash: sha256Hex(bytes),
        ...contentDescriptor(change.content, bytes),
        ...(change.mode !== undefined ? { mode: change.mode } : {}),
      };
    } else {
      if (point.state.contentKind !== "text") {
        throw new SemanticVcsError(
          "InvalidReference",
          `Text edit requires text content for ${change.fileId}`,
          { referenceKind: "text-file", reference: change.fileId },
        );
      }
      const before = observed.get(point.state.contentHash);
      if (!before)
        throw internalSemanticIntegrityFailure(
          "EffectMismatch",
          `Missing content for ${change.fileId}`,
          { fileId: change.fileId, contract: "edit-observation" },
        );
      const text = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(before);
      const edits = [...change.edits].sort(
        (left, right) => left.start - right.start,
      );
      let cursor = 0;
      let next = "";
      for (const edit of edits) {
        if (edit.start < cursor || edit.end > text.length) {
          throw new SemanticVcsError(
            "InvalidReference",
            `Invalid edit span for ${change.fileId}`,
            { referenceKind: "text-span", reference: edit },
          );
        }
        next += text.slice(cursor, edit.start) + edit.text;
        cursor = edit.end;
      }
      next += text.slice(cursor);
      bytes = new TextEncoder().encode(next);
      result = {
        ...prior,
        contentHash: sha256Hex(bytes),
        contentKind: "text",
        byteLength: bytes.length,
        coordinateExtent: next.length,
        ...(change.mode !== undefined ? { mode: change.mode } : {}),
      };
    }
    const resultEndpoint = endpointForFile(
      { ...result, fileStateId: "planned" },
      point.repository,
    );
    changes.push({
      operation,
      ordinal: 0,
      kind:
        change.kind === "text-edit"
          ? "text"
          : change.kind === "content-replace"
            ? "content-replace"
            : change.kind,
      base,
      result: resultEndpoint,
      payload:
        change.kind === "content-replace"
          ? { mode: change.mode ?? point.state.mode }
          : change.kind === "text-edit"
            ? {
                edits: [...change.edits]
                  .sort((a, b) => a.start - b.start)
                  .map(({ start, end, text }) => ({
                    start,
                    end,
                    insertedExtent: text.length,
                  })),
                ...(change.mode !== undefined ? { mode: change.mode } : {}),
              }
            : (change as unknown as Row),
    });
    fileResults.push({
      fileId: change.fileId,
      expected: point.state,
      result,
      newFile: false,
      changeRef: { kind: "authored", ordinal: operation },
    });
    if (bytes)
      blobs.push({
        contentHash: result.contentHash,
        base64: base64FromBytes(bytes),
      });
  });
  return {
    kind: input.changes.some((change) => change.kind === "repository-create")
      ? "lifecycle"
      : "edit",
    intentSummary: input.intentSummary ?? null,
    incorporatedChangeIds: [],
    changes,
    fileResults,
    repositoryResults,
    blobs,
  };
}

export function planMove(
  input: VcsMoveInput,
  basis: WorkspaceTransferBasis,
): MutationDraft {
  const changes: MutationDraft["changes"] = [];
  const fileResults: MutationDraft["fileResults"] = [];
  const repositoryResults: MutationDraft["repositoryResults"] = [];
  const movingFileIds = new Set<string>();
  const movingRepositoryIds = new Set<string>();
  const fileDestinations = new Set<string>();
  const repositoryDestinations = new Set<string>();
  const plannedRepositoryPaths = new Map<string, string>();
  for (const move of input.moves) {
    if (move.kind === "file") {
      if (movingFileIds.has(move.fileId)) {
        throw new SemanticVcsError(
          "InvalidReference",
          `File ${move.fileId} is moved more than once`,
        );
      }
      movingFileIds.add(move.fileId);
      const destination = `${move.destinationRepositoryId}:${move.destinationPath}`;
      if (fileDestinations.has(destination)) {
        throw new SemanticVcsError(
          "DestinationOccupied",
          `Multiple files target ${move.destinationPath}`,
          {
            repositoryId: move.destinationRepositoryId,
            path: move.destinationPath,
          },
        );
      }
      fileDestinations.add(destination);
    } else {
      if (movingRepositoryIds.has(move.repositoryId)) {
        throw new SemanticVcsError(
          "InvalidReference",
          `Repository ${move.repositoryId} is moved more than once`,
        );
      }
      movingRepositoryIds.add(move.repositoryId);
      if (repositoryDestinations.has(move.destinationPath)) {
        throw new SemanticVcsError(
          "DestinationOccupied",
          `Multiple repositories target ${move.destinationPath}`,
          { path: move.destinationPath },
        );
      }
      repositoryDestinations.add(move.destinationPath);
      plannedRepositoryPaths.set(move.repositoryId, move.destinationPath);
    }
  }
  input.moves.forEach((move, operation) => {
    if (move.kind === "file") {
      const point = basis.placedFile(move.repositoryId, move.fileId);
      const destination = basis.repositoryPlacement(
        move.destinationRepositoryId,
      );
      if (
        point.state.repositoryId === move.destinationRepositoryId &&
        point.state.path === move.destinationPath
      ) {
        throw new SemanticVcsError(
          "InvalidReference",
          `File ${move.fileId} is already at ${move.destinationPath}`,
        );
      }
      const occupied = basis.fileAtPath(
        move.destinationRepositoryId,
        move.destinationPath,
      );
      if (occupied && !movingFileIds.has(occupied.fileId)) {
        throw new SemanticVcsError(
          "DestinationOccupied",
          `Destination ${move.destinationPath} is occupied`,
          {
            repositoryId: move.destinationRepositoryId,
            path: move.destinationPath,
          },
        );
      }
      const { fileStateId: _priorFileStateId, ...prior } = point.state;
      const result = {
        ...prior,
        repositoryId: move.destinationRepositoryId,
        path: move.destinationPath,
      };
      changes.push({
        operation,
        ordinal: 0,
        kind: "file-move",
        base: endpointForFile(point.state, point.repository),
        result: endpointForFile(
          { ...result, fileStateId: "planned" },
          {
            ...destination,
            repoPath:
              plannedRepositoryPaths.get(move.destinationRepositoryId) ??
              destination.repoPath,
          },
        ),
        payload: move as unknown as Row,
      });
      fileResults.push({
        fileId: move.fileId,
        expected: point.state,
        result,
        newFile: false,
        changeRef: { kind: "authored", ordinal: operation },
      });
    } else {
      const repository = basis.presentRepository(move.repositoryId);
      const occupied = basis.repositoryAtPath(move.destinationPath);
      if (repository.repoPath === move.destinationPath) {
        throw new SemanticVcsError(
          "InvalidReference",
          `Repository ${move.repositoryId} is already at ${move.destinationPath}`,
        );
      }
      if (occupied && !movingRepositoryIds.has(occupied.repositoryId)) {
        throw new SemanticVcsError(
          "DestinationOccupied",
          `Repository path ${move.destinationPath} is occupied`,
          {
            repositoryId: occupied.repositoryId,
            path: move.destinationPath,
          },
        );
      }
      changes.push({
        operation,
        ordinal: 0,
        kind: "repo-move",
        base: {
          kind: "repository",
          repositoryId: move.repositoryId,
          repoPath: repository.repoPath,
        },
        result: {
          kind: "repository",
          repositoryId: move.repositoryId,
          repoPath: move.destinationPath,
        },
        payload: move as unknown as Row,
      });
      repositoryResults.push({
        repositoryId: move.repositoryId,
        expected: repository,
        resultPath: move.destinationPath,
        newRepository: false,
        changeRef: { kind: "authored", ordinal: operation },
      });
    }
  });
  return {
    kind: "file-transfer",
    intentSummary: input.intentSummary ?? null,
    incorporatedChangeIds: [],
    changes,
    fileResults,
    repositoryResults,
  };
}

export function planCopy(
  input: VcsCopyInput,
  target: WorkspaceTransferBasis,
  sourceBasis: (state: StateNodeRef) => WorkspaceTransferBasis,
): MutationDraft {
  const changes: MutationDraft["changes"] = [];
  const fileResults: MutationDraft["fileResults"] = [];
  input.copies.forEach((copy, operation) => {
    const sourceState = asState(copy.source.state);
    const source = sourceBasis(sourceState).placedFile(
      copy.source.repositoryId,
      copy.source.fileId,
    );
    const destination = target.repositoryPlacement(
      copy.destination.repositoryId,
    );
    if (
      target.fileAtPath(copy.destination.repositoryId, copy.destination.path)
    ) {
      throw new SemanticVcsError(
        "DestinationOccupied",
        `Destination ${copy.destination.path} is occupied`,
        {
          repositoryId: copy.destination.repositoryId,
          path: copy.destination.path,
        },
      );
    }
    const fileId = compactId("file", {
      commandId: input.commandId,
      operation,
      sourceFileId: copy.source.fileId,
      destination: copy.destination,
    });
    const result = {
      fileId,
      presence: "placed" as const,
      repositoryId: copy.destination.repositoryId,
      path: copy.destination.path,
      contentHash: source.state.contentHash,
      mode: source.state.mode,
      contentKind: source.state.contentKind,
      byteLength: source.state.byteLength,
      coordinateExtent: source.state.coordinateExtent,
    };
    changes.push({
      operation,
      ordinal: 0,
      kind: "file-copy",
      source: {
        kind: "file",
        state: sourceState,
        repositoryId: copy.source.repositoryId,
        repoPath: source.repository.repoPath,
        fileId: copy.source.fileId,
        path: source.state.path,
        contentHash: source.state.contentHash,
        mode: source.state.mode,
        contentKind: source.state.contentKind,
        byteLength: source.state.byteLength,
        coordinateExtent: source.state.coordinateExtent,
      },
      base: missingEndpoint(result, destination.repoPath),
      result: endpointForFile(
        { ...result, fileStateId: "planned" },
        destination,
      ),
      payload: { destination: copy.destination },
    });
    fileResults.push({
      fileId,
      expected: null,
      result,
      newFile: true,
      changeRef: { kind: "authored", ordinal: operation },
    });
  });
  return {
    kind: "file-transfer",
    intentSummary: input.intentSummary ?? null,
    incorporatedChangeIds: [],
    changes,
    fileResults,
    repositoryResults: [],
  };
}

export function planRevert(
  input: VcsRevertInput,
  basis: WorkspaceRevertBasis,
): MutationDraft {
  const changes: MutationDraft["changes"] = [];
  const fileResults: MutationDraft["fileResults"] = [];
  const repositoryResults: MutationDraft["repositoryResults"] = [];
  const originals = [...new Set(input.changeIds)].map((changeId) =>
    basis.change(changeId),
  );
  const repositoryDeletes = new Map<
    string,
    { causes: Set<string>; requiresSelectedFileRemoval: boolean }
  >();
  const addRepositoryDelete = (
    repositoryId: string,
    changeId: string,
    requiresSelectedFileRemoval: boolean,
  ) => {
    const planned = repositoryDeletes.get(repositoryId) ?? {
      causes: new Set<string>(),
      requiresSelectedFileRemoval: false,
    };
    planned.causes.add(changeId);
    planned.requiresSelectedFileRemoval ||= requiresSelectedFileRemoval;
    repositoryDeletes.set(repositoryId, planned);
  };
  for (const original of originals) {
    if (original.kind === "repo-add" || original.kind === "repo-restore") {
      const repositoryId = original.result?.["repositoryId"];
      if (typeof repositoryId !== "string") {
        throw new SemanticVcsError(
          "IntegrityFailure",
          `Repository change ${original.changeId} has no repository identity`,
        );
      }
      addRepositoryDelete(
        repositoryId,
        original.changeId,
        original.kind === "repo-add",
      );
    }
  }

  for (const original of originals) {
    const changeId = original.changeId;
    if (original.kind === "repo-add" || original.kind === "repo-restore") {
      continue;
    }
    const currentResult = original.result;
    const inverseResult = original.base;
    if (currentResult && !revertEndpointHolds(basis, currentResult)) {
      const blockers = basis.blockingChanges(original);
      if (blockers.length > 0) {
        throw new SemanticVcsError(
          "InvalidReference",
          `Change ${changeId} is not a live counteraction frontier`,
          { referenceKind: "change", reference: changeId },
        );
      }
    }
    const inverseKind = inverseChangeKind(original.kind, currentResult);
    if (!inverseKind) {
      throw new SemanticVcsError(
        "InvalidReference",
        `Change ${changeId} has no mechanical counteraction`,
      );
    }
    if (currentResult?.["kind"] === "repository") {
      const repositoryId = String(currentResult["repositoryId"] ?? "");
      const current = basis.repository(repositoryId);
      if (!repositoryId || !current) {
        throw new SemanticVcsError(
          "InvalidReference",
          `Repository change ${changeId} is not present at the target state`,
        );
      }
      const operation = changes.length;
      if (inverseKind === "repo-restore") {
        if (current.presence !== "deleted") {
          throw new SemanticVcsError(
            "RevisionChanged",
            `Change ${changeId} no longer holds`,
          );
        }
        const prior = basis.priorRepository(current);
        if (!prior || prior.presence !== "present") {
          throw new SemanticVcsError(
            "IntegrityFailure",
            `Repository tombstone ${current.repositoryStateId} has no prior state`,
          );
        }
        const priorManifestId = inverseResult?.["fileManifestId"];
        if (typeof priorManifestId !== "string") {
          throw new SemanticVcsError(
            "IntegrityFailure",
            `Repository deletion ${changeId} has no prior manifest coordinate`,
          );
        }
        const priorFiles = basis.manifest(prior, priorManifestId);
        if (priorFiles.next !== null) {
          throw new SemanticVcsError(
            "ScopeTooLarge",
            `Repository ${repositoryId} exceeds the exact revert dependency bound`,
          );
        }
        const selectedRestores = new Set(
          fileResults
            .filter(
              (result) =>
                result.result.presence === "placed" &&
                result.result.repositoryId === repositoryId,
            )
            .map((result) => result.fileId),
        );
        const blockers = priorFiles.values
          .filter((entry) => !selectedRestores.has(entry.fileId))
          .flatMap((entry) => {
            const blocking = basis.latestFileChange(entry.fileId);
            return blocking ? [blocking.changeId] : [];
          });
        if (blockers.length > 0) {
          throw new SemanticVcsError(
            "InvalidReference",
            `Repository change ${changeId} is not a live counteraction frontier`,
            { referenceKind: "change", reference: changeId },
          );
        }
        if (selectedRestores.size < priorFiles.values.length) {
          throw new SemanticVcsError(
            "IntegrityFailure",
            `Repository ${repositoryId} has a contained file without a provenance dependency`,
          );
        }
        const restoredPath = String(
          inverseResult?.["repoPath"] ?? prior.repoPath,
        );
        repositoryResults.push({
          repositoryId,
          expected: current,
          resultPath: restoredPath,
          newRepository: false,
          changeRef: { kind: "authored", ordinal: operation },
        });
      } else if (inverseKind === "repo-move") {
        if (
          current.presence !== "present" ||
          current.repoPath !== currentResult["repoPath"] ||
          typeof inverseResult?.["repoPath"] !== "string"
        ) {
          throw new SemanticVcsError(
            "RevisionChanged",
            `Change ${changeId} no longer holds`,
          );
        }
        repositoryResults.push({
          repositoryId,
          expected: current,
          resultPath: inverseResult["repoPath"],
          newRepository: false,
          changeRef: { kind: "authored", ordinal: operation },
        });
      } else {
        throw new SemanticVcsError(
          "IntegrityFailure",
          `Repository counteraction ${inverseKind} was not normalized`,
        );
      }
      changes.push({
        operation,
        ordinal: 0,
        kind: inverseKind,
        base: currentResult,
        result: inverseResult,
        payload: { counteractsChangeIds: [changeId] },
      });
      continue;
    }

    if (!currentResult || typeof currentResult["fileId"] !== "string") {
      throw new SemanticVcsError(
        "InvalidReference",
        `Change ${changeId} has no counteractable state coordinate`,
      );
    }
    const current = basis.file(String(currentResult["fileId"]));
    if (!current) {
      throw new SemanticVcsError(
        "InvalidReference",
        `File change ${changeId} is not present at the target state`,
      );
    }
    if (currentResult["kind"] === "file") {
      if (
        current.state.presence !== "placed" ||
        current.state.contentHash !== currentResult["contentHash"] ||
        current.state.path !== currentResult["path"]
      ) {
        throw new SemanticVcsError(
          "RevisionChanged",
          `Change ${changeId} no longer holds`,
        );
      }
    } else if (
      currentResult["kind"] === "missing" &&
      current.state.presence !== "deleted"
    ) {
      throw new SemanticVcsError(
        "RevisionChanged",
        `Change ${changeId} no longer holds`,
      );
    }
    const operation = changes.length;
    changes.push({
      operation,
      ordinal: 0,
      kind: inverseKind,
      base: currentResult,
      result: inverseResult,
      payload: { counteractsChangeIds: [changeId] },
    });
    if (!inverseResult || inverseResult["kind"] === "missing") {
      if (current.state.presence !== "placed") {
        throw new SemanticVcsError(
          "RevisionChanged",
          `Change ${changeId} no longer holds`,
        );
      }
      fileResults.push({
        fileId: current.state.fileId,
        expected: current.state,
        result: {
          fileId: current.state.fileId,
          presence: "deleted",
          priorFileStateId: current.state.fileStateId,
        },
        newFile: false,
        changeRef: { kind: "authored", ordinal: operation },
      });
    } else if (inverseResult["kind"] === "file") {
      fileResults.push({
        fileId: String(inverseResult["fileId"]),
        expected: current?.state ?? null,
        result: {
          fileId: String(inverseResult["fileId"]),
          presence: "placed",
          repositoryId: String(inverseResult["repositoryId"]),
          path: String(inverseResult["path"]),
          contentHash: String(inverseResult["contentHash"]),
          mode: Number(inverseResult["mode"]),
          ...contentDescriptorFromEndpoint(inverseResult),
        },
        newFile: false,
        changeRef: { kind: "authored", ordinal: operation },
      });
    }
  }

  for (const [repositoryId, planned] of [...repositoryDeletes].sort(
    ([left], [right]) => compareUtf16CodeUnits(left, right),
  )) {
    const repository = basis.repository(repositoryId);
    if (!repository || repository.presence !== "present") {
      throw new SemanticVcsError(
        "RevisionChanged",
        `Repository ${repositoryId} no longer has the imported result`,
      );
    }
    if (planned.requiresSelectedFileRemoval) {
      const page = basis.manifest(repository, repository.fileManifestId);
      if (page.next !== null) {
        throw new SemanticVcsError(
          "ScopeTooLarge",
          `Repository ${repositoryId} exceeds the exact revert dependency bound`,
        );
      }
      const selectedRemovals = new Set(
        fileResults
          .filter(
            (result) =>
              result.expected?.presence === "placed" &&
              result.expected.repositoryId === repositoryId &&
              result.result.presence === "deleted",
          )
          .map((result) => result.fileId),
      );
      const blockers = page.values
        .filter((entry) => !selectedRemovals.has(entry.fileId))
        .flatMap((entry) => {
          const change = basis.latestFileChange(entry.fileId);
          return change ? [change.changeId] : [];
        });
      if (blockers.length > 0) {
        const causeId = [...planned.causes].sort(compareUtf16CodeUnits)[0]!;
        throw new SemanticVcsError(
          "InvalidReference",
          `Repository change ${causeId} is not a live counteraction frontier`,
          { referenceKind: "change", reference: causeId },
        );
      }
      if (selectedRemovals.size !== page.values.length) {
        throw new SemanticVcsError(
          "IntegrityFailure",
          `Repository ${repositoryId} has a contained file without a provenance dependency`,
        );
      }
    }
    const operation = changes.length;
    changes.push({
      operation,
      ordinal: 0,
      kind: "repo-delete",
      base: {
        kind: "repository",
        repositoryId,
        repoPath: repository.repoPath,
        fileManifestId: repository.fileManifestId,
      },
      result: { kind: "repository", repositoryId, presence: "deleted" },
      payload: {
        counteractsChangeIds: [...planned.causes].sort(),
      },
    });
    repositoryResults.push({
      repositoryId,
      expected: repository,
      resultPath: null,
      newRepository: false,
      changeRef: { kind: "authored", ordinal: operation },
    });
  }
  return {
    kind: "revert",
    intentSummary: input.intentSummary ?? null,
    incorporatedChangeIds: [],
    changes,
    fileResults,
    repositoryResults,
  };
}

export function planImportSnapshot(
  input: VcsImportSnapshotInput,
  receipt: Row,
  basis: WorkspaceSnapshotImportBasis,
): {
  draft: MutationDraft;
  importedRepositoryIds: string[];
  externalSnapshot: VcsExternalSnapshot;
} {
  for (const repository of input.repositories) {
    for (const file of repository.files)
      assertSemanticVcsPathAdmissible(file.path);
  }
  const rows = receipt["files"];
  if (!Array.isArray(rows)) {
    throw internalSemanticIntegrityFailure(
      "EffectMismatch",
      "Content observation lacks files",
      {
        contract: "import-observation",
      },
    );
  }
  const expectedContentHashes = new Set(
    input.repositories.flatMap((repository) =>
      repository.files.map((file) => file.contentHash),
    ),
  );
  const observed = new Map<string, ObservedContentDescriptor>();
  for (const value of rows) {
    if (!value || typeof value !== "object") {
      throw internalSemanticIntegrityFailure(
        "EffectMismatch",
        "Content observation contains an invalid file",
        { contract: "import-observation" },
      );
    }
    const record = value as Row;
    const contentHash = String(record["contentHash"] ?? "");
    if (!expectedContentHashes.has(contentHash) || observed.has(contentHash)) {
      throw internalSemanticIntegrityFailure(
        "EffectMismatch",
        `Content observation contains an unexpected or duplicate digest ${contentHash}`,
        { contentHash, contract: "import-observation" },
      );
    }
    const contentKind = record["contentKind"];
    const byteLength = record["byteLength"];
    const coordinateExtent = record["coordinateExtent"];
    if (
      (contentKind !== "text" && contentKind !== "bytes") ||
      !Number.isSafeInteger(byteLength) ||
      Number(byteLength) < 0 ||
      !Number.isSafeInteger(coordinateExtent) ||
      Number(coordinateExtent) < 0 ||
      (contentKind === "bytes" && coordinateExtent !== byteLength) ||
      (contentKind === "text" && Number(coordinateExtent) > Number(byteLength))
    ) {
      throw internalSemanticIntegrityFailure(
        "EffectMismatch",
        `Content observation has an invalid intrinsic descriptor for ${contentHash}`,
        { contentHash, contract: "import-observation" },
      );
    }
    observed.set(contentHash, {
      contentKind,
      byteLength: Number(byteLength),
      coordinateExtent: Number(coordinateExtent),
    });
  }
  if (observed.size !== expectedContentHashes.size) {
    throw internalSemanticIntegrityFailure(
      "EffectMismatch",
      "Content observation is incomplete",
      { contract: "import-observation" },
    );
  }
  const declaredCanonicalSnapshot = input.source.snapshot;
  if (declaredCanonicalSnapshot) {
    const repository = input.repositories[0];
    if (!repository || input.repositories.length !== 1) {
      throw new SemanticVcsError(
        "IntegrityFailure",
        "Canonical external snapshot verification requires exactly one repository",
      );
    }
    const computedCanonicalSnapshot = canonicalSnapshotDigest(
      repository.files.map((file) => {
        const descriptor = observed.get(file.contentHash);
        if (!descriptor) {
          throw internalSemanticIntegrityFailure(
            "EffectMismatch",
            `Content observation lacks ${file.contentHash}`,
            { contentHash: file.contentHash, contract: "import-observation" },
          );
        }
        return {
          path: file.path,
          mode: file.mode === 0o755 ? 0o100755 : 0o100644,
          size: descriptor.byteLength,
          contentHash: file.contentHash,
        };
      }),
    );
    if (computedCanonicalSnapshot !== declaredCanonicalSnapshot) {
      throw new SemanticVcsError(
        "IntegrityFailure",
        "Imported descriptors do not match the declared canonical snapshot",
        {
          declaredCanonicalSnapshot,
          computedCanonicalSnapshot,
        },
      );
    }
  }
  const changes: MutationDraft["changes"] = [];
  const fileResults: MutationDraft["fileResults"] = [];
  const repositoryResults: MutationDraft["repositoryResults"] = [];
  const repositories = importedRepositories(input);
  const importedRepositoryIds = repositories.map(
    ({ repositoryId }) => repositoryId,
  );
  const snapshotDigest = importedSnapshotDigest(input.repositories, observed);
  for (const { input: repositoryInput, repositoryId } of repositories) {
    const existing = repositoryInput.repositoryId
      ? snapshotImportTarget(
          basis.repository(repositoryId),
          repositoryId,
          repositoryInput.repoPath,
        )
      : null;
    if (existing == null) {
      const changeIndex = changes.length;
      changes.push({
        operation: changeIndex,
        ordinal: 0,
        kind: "repo-add",
        base: null,
        result: {
          kind: "repository",
          repositoryId,
          repoPath: repositoryInput.repoPath,
        },
        payload: {},
      });
      repositoryResults.push({
        repositoryId,
        expected: null,
        resultPath: repositoryInput.repoPath,
        newRepository: true,
        changeRef: { kind: "authored", ordinal: changeIndex },
      });
    }
    const expectedByPath = existing
      ? basis.files(existing)
      : new Map<string, PlacedFileState>();
    const importedPaths = new Set(
      repositoryInput.files.map((file) => file.path),
    );
    for (const [path, prior] of expectedByPath) {
      if (importedPaths.has(path)) continue;
      if (!existing || existing.presence !== "present") {
        throw new SemanticVcsError(
          "IntegrityFailure",
          `Imported deletion has no present repository ${repositoryId}`,
        );
      }
      const changeIndex = changes.length;
      changes.push({
        operation: changeIndex,
        ordinal: 0,
        kind: "file-delete",
        base: endpointForFile(prior, existing),
        result: missingEndpoint(prior, existing.repoPath),
        payload: {},
      });
      fileResults.push({
        fileId: prior.fileId,
        expected: prior,
        result: {
          fileId: prior.fileId,
          presence: "deleted",
          priorFileStateId: prior.fileStateId,
        },
        newFile: false,
        changeRef: { kind: "authored", ordinal: changeIndex },
      });
    }
    for (const file of repositoryInput.files) {
      const descriptor = observed.get(file.contentHash);
      if (!descriptor) {
        throw internalSemanticIntegrityFailure(
          "EffectMismatch",
          `Content observation lacks ${file.contentHash}`,
          { contentHash: file.contentHash, contract: "import-observation" },
        );
      }
      const prior = expectedByPath.get(file.path) ?? null;
      if (
        prior &&
        prior.contentHash === file.contentHash &&
        prior.mode === file.mode &&
        prior.contentKind === descriptor.contentKind &&
        prior.byteLength === descriptor.byteLength &&
        prior.coordinateExtent === descriptor.coordinateExtent
      ) {
        continue;
      }
      const fileId =
        prior?.fileId ??
        compactId("file", {
          commandId: input.commandId,
          repositoryId,
          path: file.path,
        });
      const result = {
        fileId,
        presence: "placed" as const,
        repositoryId,
        path: file.path,
        contentHash: file.contentHash,
        mode: file.mode,
        ...descriptor,
      };
      const changeIndex = changes.length;
      const resultEndpoint: Row = {
        kind: "file",
        ...result,
        repoPath: repositoryInput.repoPath,
      };
      if (prior) {
        if (!existing || existing.presence !== "present") {
          throw new SemanticVcsError(
            "IntegrityFailure",
            `Imported replacement has no present repository ${repositoryId}`,
          );
        }
        const contentUnchanged =
          prior.contentHash === file.contentHash &&
          prior.contentKind === descriptor.contentKind &&
          prior.byteLength === descriptor.byteLength &&
          prior.coordinateExtent === descriptor.coordinateExtent;
        changes.push({
          operation: changeIndex,
          ordinal: 0,
          kind: contentUnchanged ? "file-mode" : "content-replace",
          base: endpointForFile(prior, existing),
          result: resultEndpoint,
          payload: contentUnchanged ? { mode: file.mode } : {},
        });
      } else {
        changes.push({
          operation: changeIndex,
          ordinal: 0,
          kind: "file-create",
          base: missingEndpoint(result, repositoryInput.repoPath),
          result: resultEndpoint,
          payload: {},
        });
      }
      fileResults.push({
        fileId,
        expected: prior,
        result,
        newFile: prior == null,
        changeRef: { kind: "authored", ordinal: changeIndex },
      });
    }
  }
  const externalSnapshot: VcsExternalSnapshot = {
    sourceKind: input.source.kind,
    sourceUri:
      input.source.kind === "git" ? input.source.url : input.source.uri,
    snapshotRevision:
      input.source.kind === "git"
        ? input.source.commit
        : input.source.snapshotRevision,
    ...(input.source.kind === "git"
      ? {
          sourceSubdir: input.source.subdir ?? null,
          canonicalSnapshot: input.source.snapshot,
        }
      : input.source.snapshot
        ? { canonicalSnapshot: input.source.snapshot }
        : {}),
    snapshotDigest,
    targetRepositoryIds: [...new Set(importedRepositoryIds)].sort(
      compareUtf16CodeUnits,
    ),
  };
  const draft: MutationDraft = {
    kind: "import",
    intentSummary: input.intentSummary ?? input.message ?? null,
    externalSnapshot,
    incorporatedChangeIds: [],
    changes,
    fileResults,
    repositoryResults,
  };
  return { draft, importedRepositoryIds, externalSnapshot };
}

/** Normalize sealed snapshot evidence independently of the working-state representation. */
export function planExternalDeltaDraft(
  input: VcsRegisterExternalDeltaInput,
  receipt: Row,
  basis: {
    fileIdAtPath(path: string): string | null;
    evidence(): Pick<WorkUnitRecord, "authorContextId" | "triggerEvidence">;
    now(): string;
  },
): {
  record: ExternalDeltaRecord;
  workUnit: WorkUnitRecord;
  changes: ChangeRecord[];
  newFileIds: Set<string>;
} {
  const rows = receipt["files"];
  if (!Array.isArray(rows)) {
    throw internalSemanticIntegrityFailure(
      "EffectMismatch",
      "Delta observation lacks files",
    );
  }
  const observed = new Map<string, ObservedContentDescriptor>();
  for (const value of rows) {
    const row = value as Row;
    const contentHash = String(row["contentHash"] ?? "");
    observed.set(contentHash, {
      contentKind: row["contentKind"] as "text" | "bytes",
      byteLength: Number(row["byteLength"]),
      coordinateExtent: Number(row["coordinateExtent"]),
    });
  }
  const digestFor = (files: typeof input.oldFiles) =>
    canonicalSnapshotDigest(
      files.map((file) => {
        const descriptor = observed.get(file.contentHash);
        if (!descriptor) {
          throw internalSemanticIntegrityFailure(
            "EffectMismatch",
            `Delta observation lacks ${file.contentHash}`,
          );
        }
        return {
          path: file.path,
          mode: file.mode === 0o755 ? 0o100755 : 0o100644,
          size: descriptor.byteLength,
          contentHash: file.contentHash,
        };
      }),
    );
  const oldSnapshot = digestFor(input.oldFiles);
  const newSnapshot = digestFor(input.newFiles);
  if (
    oldSnapshot !== input.oldSource.snapshot ||
    newSnapshot !== input.newSource.snapshot
  ) {
    throw new SemanticVcsError(
      "IntegrityFailure",
      "External delta descriptors do not match their declared snapshots",
    );
  }
  const deltaId = compactId("external-delta:v1", {
    ownerContextId: input.contextId,
    repositoryId: input.repositoryId,
    oldSnapshot,
    newSnapshot,
  });
  const externalKeys = [
    `repo:${externalSourceIdentity(input.oldSource)}`,
    `repo:${externalSourceIdentity(input.newSource)}`,
  ].sort(compareUtf16CodeUnits);
  const evidence = basis.evidence();
  const workUnitIdValue = workUnitIdentity({
    commandId: input.commandId,
    kind: "external-unapplied",
    intentSummary: input.intentSummary ?? null,
    ...evidence,
    externalSnapshot: null,
    contentClass: "external",
    externalKeys,
  });
  const oldByPath = new Map(input.oldFiles.map((file) => [file.path, file]));
  const newByPath = new Map(input.newFiles.map((file) => [file.path, file]));
  const paths = [...new Set([...oldByPath.keys(), ...newByPath.keys()])].sort(
    compareUtf16CodeUnits,
  );
  const changes: ChangeRecord[] = [];
  const newFileIds = new Set<string>();
  for (const [operation, path] of paths.entries()) {
    const oldFile = oldByPath.get(path);
    const newFile = newByPath.get(path);
    if (
      oldFile &&
      newFile &&
      oldFile.contentHash === newFile.contentHash &&
      oldFile.mode === newFile.mode
    ) {
      continue;
    }
    const placed = basis.fileIdAtPath(path);
    const fileId =
      placed ??
      compactId("external-file", {
        deltaId,
        repositoryId: input.repositoryId,
        path,
      });
    if (placed === null) newFileIds.add(fileId);
    const endpoint = (file: typeof oldFile): Row | null => {
      if (!file) return null;
      const descriptor = observed.get(file.contentHash)!;
      return {
        kind: "file",
        fileId,
        repositoryId: input.repositoryId,
        repoPath: input.repoPath,
        path,
        contentHash: file.contentHash,
        mode: file.mode,
        ...descriptor,
      };
    };
    const base = oldFile
      ? endpoint(oldFile)
      : {
          kind: "missing",
          fileId,
          repositoryId: input.repositoryId,
          repoPath: input.repoPath,
          path,
        };
    const result = newFile
      ? endpoint(newFile)
      : {
          kind: "missing",
          fileId,
          repositoryId: input.repositoryId,
          repoPath: input.repoPath,
          path,
        };
    const kind = !oldFile
      ? "file-create"
      : !newFile
        ? "file-delete"
        : oldFile.contentHash === newFile.contentHash
          ? "file-mode"
          : "content-replace";
    const withoutIdentity = {
      workUnitId: workUnitIdValue,
      operation,
      ordinal: 0,
      kind,
      source: null,
      base,
      result,
      payload: kind === "file-mode" ? { mode: newFile!.mode } : {},
    };
    const changeId = changeIdentity(withoutIdentity);
    changes.push({
      ...withoutIdentity,
      changeId,
      effectDigest: compactId("change-effect", {
        kind,
        base,
        result,
        payload: withoutIdentity.payload,
      }),
    });
  }
  const createdAt = basis.now();
  const workUnit: WorkUnitRecord = {
    workUnitId: workUnitIdValue,
    commandId: input.commandId,
    kind: "external-unapplied",
    authoredChangeIds: changes.map((change) => change.changeId),
    intentSummary: input.intentSummary ?? null,
    ...evidence,
    externalSnapshot: null,
    contentClass: "external",
    externalKeys,
    normalizationProtocol: NORMALIZATION_PROTOCOL,
    createdAt,
  };
  const record: ExternalDeltaRecord = {
    deltaId,
    workUnitId: workUnitIdValue,
    ownerContextId: input.contextId,
    repositoryId: input.repositoryId,
    repoPath: input.repoPath,
    targetState: asState(input.expectedWorkingHead),
    oldSource: input.oldSource as unknown as Row,
    newSource: input.newSource as unknown as Row,
    oldSnapshot,
    newSnapshot,
    inputDigest: compactId("external-delta-input", {
      repositoryId: input.repositoryId,
      repoPath: input.repoPath,
      oldSource: input.oldSource,
      newSource: input.newSource,
      oldFiles: input.oldFiles,
      newFiles: input.newFiles,
      supersedesDeltaId: input.supersedesDeltaId ?? null,
    }),
    status: "active",
    supersededByDeltaId: null,
    createdAt,
  };
  return { record, workUnit, changes, newFileIds };
}

function externalSourceIdentity(
  source: VcsRegisterExternalDeltaInput["oldSource"],
): string {
  return source.kind === "git"
    ? `${source.url}@${source.commit}${source.subdir ? `:${source.subdir}` : ""}`
    : `${source.uri}@${source.snapshotRevision}`;
}

/** Build provenance once, using the exact placement and lineage reads of its owner. */
export function prepareApplication<Placement>(
  input: { contextId: string; expectedWorkingHead: VcsStateNodeRef },
  draft: MutationDraft,
  commandId: string,
  preparation: MutationPreparation<Placement>,
  profileStartedAt = Date.now(),
) {
  const basis = asState(input.expectedWorkingHead);
  const createdAt = preparation.now();
  const contentIntegrity = preparation.contentIntegrity(basis, draft);
  const evidence = preparation.workUnitEvidence(input.contextId, commandId);
  const workUnitIdValue = workUnitIdentity({
    commandId,
    kind: draft.kind,
    intentSummary: draft.intentSummary,
    ...evidence,
    externalSnapshot: draft.externalSnapshot ?? null,
    contentClass: contentIntegrity.class,
    externalKeys: contentIntegrity.externalKeys,
  });
  const setupCompletedAt = Date.now();
  const changes: ChangeRecord[] = draft.changes.map((change) => {
    const withoutIdentity = {
      ...change,
      source: change.source ?? null,
      workUnitId: workUnitIdValue,
    };
    const changeId = changeIdentity(withoutIdentity);
    return {
      ...withoutIdentity,
      changeId,
      effectDigest: compactId("change-effect", {
        kind: change.kind,
        source: change.source ?? null,
        base: change.base,
        result: change.result,
        payload: change.payload,
      }),
    };
  });
  const changesCompletedAt = Date.now();
  const changeIdAt = (ordinal: number): string => {
    const value = changes[ordinal]?.changeId;
    if (!value)
      throw new SemanticVcsError(
        "IntegrityFailure",
        `Missing change ordinal ${ordinal}`,
      );
    return value;
  };
  const changeIdFor = (ref: DraftChangeRef): string =>
    ref.kind === "existing" ? ref.changeId : changeIdAt(ref.ordinal);
  const fileTransitions: FileTransition[] = draft.fileResults.map((value) => ({
    fileId: value.fileId,
    expected: value.expected,
    result:
      value.result.presence === "placed"
        ? workspaceFileStateIdentity(value.result)
        : workspaceFileStateIdentity({
            fileId: value.result.fileId,
            presence: "deleted",
            priorFileStateId: value.result.priorFileStateId,
            tombstoneChangeId: changeIdFor(value.changeRef),
          }),
    changeId: changeIdFor(value.changeRef),
    newFile: value.newFile,
  }));
  const repoTransitions: RepositoryTransition[] = draft.repositoryResults.map(
    (value) => ({
      repositoryId: value.repositoryId,
      expected: value.expected,
      resultPath: value.resultPath,
      changeId: value.changeRef === null ? null : changeIdFor(value.changeRef),
      tombstoneChangeId:
        value.resultPath === null && value.changeRef !== null
          ? changeIdFor(value.changeRef)
          : null,
      newRepository: value.newRepository,
    }),
  );
  const transitionsCompletedAt = Date.now();
  const workspaceFileTransitions = fileTransitions.filter(
    ({ expected, result }) => expected?.fileStateId !== result.fileStateId,
  );
  const { placement, resultRoot, workspacePlanCompletedAt } =
    preparation.preparePlacement(workspaceFileTransitions, repoTransitions);
  const workspaceProofCompletedAt = Date.now();
  const appliedChangeSources = [
    ...changes,
    ...(draft.appliedSourceChanges ?? []),
  ];
  const predicatesByChangeId = new Map<string, StatePredicateRecord[]>();
  const predicatesFor = (changeId: string): StatePredicateRecord[] => {
    let predicates = predicatesByChangeId.get(changeId);
    if (!predicates) {
      predicates = [];
      predicatesByChangeId.set(changeId, predicates);
    }
    return predicates;
  };
  for (const file of fileTransitions) {
    predicatesFor(file.changeId).push(predicateForState(file.result));
  }
  for (const repository of repoTransitions) {
    if (repository.tombstoneChangeId) {
      predicatesFor(repository.tombstoneChangeId).push({
        kind: "repository-absent",
        repositoryId: repository.repositoryId,
      });
    }
    if (repository.changeId && typeof repository.resultPath === "string") {
      predicatesFor(repository.changeId).push({
        kind: "repository-present",
        repositoryId: repository.repositoryId,
        repoPath: repository.resultPath,
      });
    }
  }
  const appliedDrafts = appliedChangeSources.map((change, ordinal) => {
    return {
      changeId: change.changeId,
      ordinal,
      appliedBase: change.base,
      appliedResult: change.result,
      resultPredicates: predicatesByChangeId.get(change.changeId) ?? [],
    };
  });
  const applicationIdValue = applicationIdentity({
    workUnitId: workUnitIdValue,
    basis,
    resultWorkspaceFactRootId: resultRoot,
    semanticProtocol: SEMANTIC_PROTOCOL,
    changes: appliedDrafts,
  });
  const appliedChanges: AppliedChangeRecord[] = appliedDrafts.map((value) => {
    const withoutIdentity = { ...value, applicationId: applicationIdValue };
    return {
      ...withoutIdentity,
      appliedChangeId: appliedChangeIdentity(withoutIdentity),
    };
  });
  const application: ApplicationRecord = {
    applicationId: applicationIdValue,
    workUnitId: workUnitIdValue,
    basis,
    appliedChangeIds: appliedChanges.map((value) => value.appliedChangeId),
    resultWorkspaceFactRootId: resultRoot,
    semanticProtocol: SEMANTIC_PROTOCOL,
  };
  const applicationIdentityCompletedAt = Date.now();
  const newFileChangeIds = new Set(
    fileTransitions
      .filter((transition) => transition.newFile)
      .map((transition) => transition.changeId),
  );
  const contentParentsByState = new Map<
    string,
    { state: StateNodeRef; fileIds: Set<string> }
  >();
  const selectContentParent = (state: StateNodeRef, fileId: string): void => {
    const key = stateNodeKey(state);
    let selection = contentParentsByState.get(key);
    if (!selection) {
      selection = { state, fileIds: new Set() };
      contentParentsByState.set(key, selection);
    }
    selection.fileIds.add(fileId);
  };
  for (const change of appliedChangeSources) {
    const child =
      contentEndpoint(change.result) ?? contentEndpoint(change.base);
    if (!child) continue;
    if (change.kind === "file-copy") {
      if (change.source) {
        selectContentParent(asState(change.source.state), change.source.fileId);
      }
    } else if (!newFileChangeIds.has(change.changeId)) {
      selectContentParent(basis, child.fileId);
    }
  }
  const contentParents = new Map(contentIntegrity.contentOrigins);
  for (const selection of contentParentsByState.values()) {
    const missingFileIds = [...selection.fileIds].filter(
      (fileId) => !contentParents.has(stateFileKey(selection.state, fileId)),
    );
    for (const [fileId, parent] of preparation.contentOrigins(
      selection.state,
      missingFileIds,
    )) {
      contentParents.set(stateFileKey(selection.state, fileId), parent);
    }
  }
  const derivedContentEdges = appliedChanges.flatMap(
    (appliedChange, ordinal) => {
      const change = appliedChangeSources[ordinal];
      if (!change) return [];
      const child =
        contentEndpoint(change.result) ?? contentEndpoint(change.base);
      if (!child) {
        if (change.kind === "file-copy") {
          throw new SemanticVcsError(
            "IntegrityFailure",
            `Copy change ${change.changeId} has no content endpoint`,
          );
        }
        return [];
      }
      const copySource = change.kind === "file-copy" ? change.source : null;
      if (change.kind === "file-copy" && !copySource) {
        throw new SemanticVcsError(
          "IntegrityFailure",
          `Copy change ${change.changeId} has no exact source coordinate`,
        );
      }
      if (change.kind !== "file-copy" && newFileChangeIds.has(change.changeId))
        return [];
      const parentState = copySource ? copySource.state : basis;
      const parentFileId = copySource ? copySource.fileId : child.fileId;
      const parent =
        contentParents.get(stateFileKey(parentState, parentFileId)) ?? null;
      if (!parent) {
        if (copySource) {
          throw new SemanticVcsError(
            "IntegrityFailure",
            `Copy change ${change.changeId} reaches no source content origin`,
          );
        }
        return [];
      }
      const parentEndpoint = parent.content;
      if (!parentEndpoint) {
        if (copySource) {
          throw new SemanticVcsError(
            "IntegrityFailure",
            `Copy change ${change.changeId} reaches source without content coordinates`,
          );
        }
        return [];
      }
      let relation: ContentEdgeRecord["relation"];
      let mappings: ContentMapping[];
      if (copySource) {
        if (
          child.contentHash !== copySource.contentHash ||
          parentEndpoint.fileId !== copySource.fileId ||
          parentEndpoint.contentHash !== copySource.contentHash ||
          parentEndpoint.coordinateKind !== child.coordinateKind ||
          parentEndpoint.coordinateExtent !== child.coordinateExtent
        ) {
          throw new SemanticVcsError(
            "IntegrityFailure",
            `Copy change ${change.changeId} does not match its exact source content`,
          );
        }
        relation = "copies";
        mappings = [
          mappingForWholeFile({
            childContentHash: child.contentHash,
            parentContentHash: parentEndpoint.contentHash,
            coordinateKind: child.coordinateKind,
            coordinateExtent: child.coordinateExtent,
          }),
        ];
      } else if (
        parentEndpoint.contentHash === child.contentHash &&
        parentEndpoint.coordinateKind === child.coordinateKind &&
        parentEndpoint.coordinateExtent === child.coordinateExtent
      ) {
        relation = "preserves";
        mappings = [
          mappingForWholeFile({
            childContentHash: child.contentHash,
            parentContentHash: parentEndpoint.contentHash,
            coordinateKind: child.coordinateKind,
            coordinateExtent: child.coordinateExtent,
          }),
        ];
      } else if (change.kind === "text") {
        const base = contentEndpoint(change.base);
        if (
          !base ||
          base.coordinateKind !== "utf16" ||
          child.coordinateKind !== "utf16" ||
          parentEndpoint.contentHash !== base.contentHash ||
          parentEndpoint.coordinateKind !== base.coordinateKind ||
          parentEndpoint.coordinateExtent !== base.coordinateExtent
        ) {
          return [];
        }
        relation = "incorporates";
        const counteractedChangeIds = counteractedChangeIds(change);
        mappings =
          counteractedChangeIds.length > 0
            ? preparation.invertedCounteractions(
                counteractedChangeIds,
                child,
                parentEndpoint,
              )
            : mappingsForTextEdits({
                childContentHash: child.contentHash,
                childExtent: child.coordinateExtent,
                parentContentHash: parentEndpoint.contentHash,
                parentExtent: parentEndpoint.coordinateExtent,
                edits: change.payload["edits"],
              });
      } else {
        return [];
      }
      const withoutIdentity: Omit<ContentEdgeRecord, "contentEdgeId"> = {
        childAppliedChangeId: appliedChange.appliedChangeId,
        parent: parent.ref,
        relation,
        mappings,
      };
      return [
        {
          ...withoutIdentity,
          contentEdgeId: contentEdgeIdentity(withoutIdentity),
        },
      ];
    },
  );
  const composedContentEdges = (draft.contentDerivations ?? []).map(
    (derivation) => {
      const childChangeId = changeIdFor(derivation.childChangeRef);
      const child = appliedChanges.find(
        (applied) => applied.changeId === childChangeId,
      );
      if (!child) {
        throw new SemanticVcsError(
          "IntegrityFailure",
          `Composed content child ${childChangeId} was not applied`,
        );
      }
      const parentOrigin: ContentOriginRef =
        derivation.parent.kind === "origin"
          ? derivation.parent.origin
          : (() => {
              const parentChangeId = changeIdFor(derivation.parent.changeRef);
              const parent = appliedChanges.find(
                (applied) => applied.changeId === parentChangeId,
              );
              if (!parent) {
                throw new SemanticVcsError(
                  "IntegrityFailure",
                  `Composed content parent ${parentChangeId} was not applied`,
                );
              }
              return {
                kind: "applied-change",
                appliedChangeId: parent.appliedChangeId,
              };
            })();
      const withoutIdentity: Omit<ContentEdgeRecord, "contentEdgeId"> = {
        childAppliedChangeId: child.appliedChangeId,
        parent: parentOrigin,
        relation: "incorporates",
        mappings: derivation.mappings,
      };
      return {
        ...withoutIdentity,
        contentEdgeId: contentEdgeIdentity(withoutIdentity),
      };
    },
  );
  const contentEdges = [
    ...(draft.contentEdges ?? []),
    ...derivedContentEdges,
    ...composedContentEdges,
  ].filter(
    (edge, index, values) =>
      values.findIndex(
        (candidate) => candidate.contentEdgeId === edge.contentEdgeId,
      ) === index,
  );
  const contentEdgesCompletedAt = Date.now();
  const decisions: IntegrationDecisionRecord[] = (draft.decisions ?? []).map(
    (decision) => {
      const complete: Omit<IntegrationDecisionRecord, "decisionId"> = {
        ...decision,
        entries: decision.entries.map(({ resultChangeRef, ...entry }) => ({
          ...entry,
          resultChangeId: resultChangeRef ? changeIdFor(resultChangeRef) : null,
        })),
        workUnitId: workUnitIdValue,
        createdAt,
      };
      return { ...complete, decisionId: decisionIdentity(complete) };
    },
  );
  const workUnit: WorkUnitRecord = {
    workUnitId: workUnitIdValue,
    commandId,
    kind: draft.kind,
    authoredChangeIds: changes.map((value) => value.changeId),
    intentSummary: draft.intentSummary,
    ...evidence,
    externalSnapshot: draft.externalSnapshot ?? null,
    contentClass: contentIntegrity.class,
    externalKeys: contentIntegrity.externalKeys,
    normalizationProtocol: NORMALIZATION_PROTOCOL,
    createdAt,
  };
  const plan: ApplicationPersistencePlan = {
    contextId: input.contextId,
    expectedWorkingHead: basis,
    workUnit,
    changes,
    application,
    appliedChanges,
    contentEdges,
    decisions,
    newRepositories: repoTransitions
      .filter((value) => value.newRepository)
      .map(({ repositoryId }) => ({ repositoryId })),
    newFiles: fileTransitions
      .filter((value) => value.newFile)
      .map((value) => ({
        fileId: value.fileId,
        repositoryId:
          value.result.presence === "placed" ? value.result.repositoryId : "",
        changeId: value.changeId,
      })),
  };
  const planCompletedAt = Date.now();
  return {
    plan,
    placement,
    profileStartedAt,
    timings: {
      changes: changes.length,
      repositories: repoTransitions.length,
      files: fileTransitions.length,
      setupMs: setupCompletedAt - profileStartedAt,
      changeIdentitiesMs: changesCompletedAt - setupCompletedAt,
      transitionsMs: transitionsCompletedAt - changesCompletedAt,
      workspacePlanMs: workspacePlanCompletedAt - transitionsCompletedAt,
      workspaceProofMs: workspaceProofCompletedAt - workspacePlanCompletedAt,
      applicationIdentitiesMs:
        applicationIdentityCompletedAt - workspaceProofCompletedAt,
      contentEdgesMs: contentEdgesCompletedAt - applicationIdentityCompletedAt,
      planAssemblyMs: planCompletedAt - contentEdgesCompletedAt,
    },
    result: {
      commandId,
      contextId: input.contextId,
      workUnitId: workUnitIdValue,
      applicationId: applicationIdValue,
      changeCount: changes.length,
      changeIds: changes.slice(0, 200).map((value) => value.changeId),
      incorporatedChangeCount: draft.incorporatedChangeIds.length,
      incorporatedChangeIds: draft.incorporatedChangeIds.slice(0, 200),
      decisionIds: decisions.map((value) => value.decisionId),
    },
  };
}

export function counteractedChangeIds(change: ChangeRecord): string[] {
  const values = change.payload["counteractsChangeIds"];
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string")
    : [];
}

export function changeCoordinate(change: ChangeRecord): string | null {
  const endpoint = change.result ?? change.base;
  if (typeof endpoint?.["fileId"] === "string")
    return `file:${endpoint["fileId"]}`;
  if (typeof endpoint?.["repositoryId"] === "string") {
    return `repository:${endpoint["repositoryId"]}`;
  }
  return null;
}

export function revertEndpointHolds(
  basis: Pick<WorkspaceRevertBasis, "file" | "repository">,
  endpoint: Row,
): boolean {
  if (endpoint["kind"] === "file" && typeof endpoint["fileId"] === "string") {
    const point = basis.file(endpoint["fileId"]);
    if (!point || point.state.presence !== "placed") return false;
    const expected = endpoint;
    const repository = basis.repository(point.state.repositoryId);
    return (
      repository?.presence === "present" &&
      point.state.repositoryId === expected["repositoryId"] &&
      point.state.path === expected["path"] &&
      point.state.contentHash === expected["contentHash"] &&
      point.state.mode === expected["mode"] &&
      point.state.contentKind === expected["contentKind"] &&
      point.state.byteLength === expected["byteLength"] &&
      point.state.coordinateExtent === expected["coordinateExtent"]
    );
  }
  if (
    endpoint["kind"] === "missing" &&
    typeof endpoint["fileId"] === "string"
  ) {
    const point = basis.file(endpoint["fileId"]);
    return !point || point.state.presence === "deleted";
  }
  if (
    endpoint["kind"] === "repository" &&
    typeof endpoint["repositoryId"] === "string"
  ) {
    const member = basis.repository(endpoint["repositoryId"]);
    if (endpoint["presence"] === "deleted")
      return !member || member.presence === "deleted";
    return (
      member?.presence === "present" &&
      (typeof endpoint["repoPath"] !== "string" ||
        member.repoPath === endpoint["repoPath"])
    );
  }
  return false;
}
