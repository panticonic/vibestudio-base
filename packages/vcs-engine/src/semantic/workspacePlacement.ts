import { assertSemanticVcsPathAdmissible } from "@vibestudio/shared/vcs/pathAdmission";
import { compactId } from "./identity.js";
import type { ContentDescriptor } from "./model.js";
export type WorkspaceRepositoryMember =
  | {
      repositoryStateId: string;
      repositoryId: string;
      presence: "present";
      repoPath: string;
      fileManifestId: string;
    }
  | {
      repositoryStateId: string;
      repositoryId: string;
      presence: "deleted";
      priorRepositoryStateId: string;
      tombstoneChangeId: string;
    };

export function workspaceRepositoryStateIdentity(
  input:
    | Omit<
        Extract<WorkspaceRepositoryMember, { presence: "present" }>,
        "repositoryStateId"
      >
    | Omit<
        Extract<WorkspaceRepositoryMember, { presence: "deleted" }>,
        "repositoryStateId"
      >,
): WorkspaceRepositoryMember {
  const value = {
    repositoryStateId: compactId("workspace-repository-state", input),
    ...input,
  } as WorkspaceRepositoryMember;
  if (!validRepositoryPayload(value))
    throw new Error("workspace repository state is invalid");
  return value;
}

export function authenticateWorkspaceRepositoryMember(
  member: WorkspaceRepositoryMember,
): WorkspaceRepositoryMember {
  if (
    !validRepositoryPayload(member) ||
    repositoryStateId(member) !== member.repositoryStateId
  ) {
    throw new Error("workspace repository state failed authentication");
  }
  return { ...member };
}

const repositoryStateId = (member: WorkspaceRepositoryMember): string => {
  const { repositoryStateId: _identity, ...payload } = member;
  return compactId("workspace-repository-state", payload);
};

export type WorkspaceFileState =
  | ({
      fileStateId: string;
      fileId: string;
      presence: "placed";
      repositoryId: string;
      path: string;
      contentHash: string;
      mode: number;
    } & ContentDescriptor)
  | {
      fileStateId: string;
      fileId: string;
      presence: "deleted";
      priorFileStateId: string;
      tombstoneChangeId: string;
    };

export function workspaceFileStateIdentity(
  input:
    | Omit<Extract<WorkspaceFileState, { presence: "placed" }>, "fileStateId">
    | Omit<Extract<WorkspaceFileState, { presence: "deleted" }>, "fileStateId">,
): WorkspaceFileState {
  const value = {
    fileStateId: compactId("workspace-file-state", input),
    ...input,
  } as WorkspaceFileState;
  if (!validFilePayload(value))
    throw new Error("workspace file state is invalid");
  return value;
}

export function authenticateWorkspaceFileState(
  state: WorkspaceFileState,
): WorkspaceFileState {
  const { fileStateId: _identity, ...payload } = state;
  if (
    !validFilePayload(state) ||
    compactId("workspace-file-state", payload) !== state.fileStateId
  ) {
    throw new Error("workspace file state failed authentication");
  }
  return { ...state };
}

export interface WorkspaceRepositoryChange {
  repositoryId: string;
  expected: WorkspaceRepositoryMember | null;
  result: WorkspaceRepositoryMember;
}

export interface WorkspaceFileStateChange {
  fileId: string;
  expected: WorkspaceFileState | null;
  result: WorkspaceFileState;
}

const validPath = (path: string): boolean => {
  try {
    assertSemanticVcsPathAdmissible(path);
    return path.length > 0;
  } catch {
    return false;
  }
};

// Local mutations validate payloads, not identities we just generated or read
// from our own store. Explicit authentication remains available for foreign records.
const validRepositoryPayload = (member: WorkspaceRepositoryMember): boolean =>
  Boolean(
    member.repositoryId &&
    (member.presence === "present"
      ? validPath(member.repoPath) && member.fileManifestId
      : member.priorRepositoryStateId && member.tombstoneChangeId),
  );

const validFilePayload = (state: WorkspaceFileState): boolean =>
  Boolean(
    state.fileId &&
    (state.presence === "placed"
      ? state.repositoryId &&
        validPath(state.path) &&
        state.contentHash &&
        Number.isSafeInteger(state.mode) &&
        state.mode >= 0 &&
        (state.contentKind === "text" || state.contentKind === "bytes") &&
        Number.isSafeInteger(state.byteLength) &&
        state.byteLength >= 0 &&
        Number.isSafeInteger(state.coordinateExtent) &&
        state.coordinateExtent >= 0 &&
        (state.contentKind !== "bytes" ||
          state.coordinateExtent === state.byteLength)
      : state.priorFileStateId && state.tombstoneChangeId),
  );
