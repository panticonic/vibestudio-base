import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import {
  authenticateWorkspaceFileState,
  workspaceFileStateIdentity,
  workspaceRepositoryStateIdentity,
} from "./workspacePlacement.js";
vi.mock("@vibestudio/content-addressing", async (loadOriginal) => {
  const original = await loadOriginal<typeof import("@vibestudio/content-addressing")>();
  return { ...original, sha256HexSyncText: vi.fn(original.sha256HexSyncText) };
});

beforeEach(() => vi.mocked(sha256HexSyncText).mockClear());

describe("locally owned content identities", () => {
  it("hashes each new state once and reserves reauthentication for explicit callers", () => {
    const state = workspaceFileStateIdentity({
      fileId: "file-1",
      presence: "placed",
      repositoryId: "repo-1",
      path: "src/index.ts",
      contentHash: "blob-1",
      mode: 0o100644,
      contentKind: "text",
      byteLength: 8,
      coordinateExtent: 5,
    });
    expect(sha256HexSyncText).toHaveBeenCalledTimes(1);
    workspaceRepositoryStateIdentity({
      repositoryId: "repo-1",
      presence: "present",
      repoPath: "packages/core",
      fileManifestId: "manifest-1",
    });
    expect(sha256HexSyncText).toHaveBeenCalledTimes(2);
    expect(() => authenticateWorkspaceFileState({ ...state, fileId: "other-file" })).toThrow(
      "failed authentication"
    );
    expect(sha256HexSyncText).toHaveBeenCalledTimes(3);
  });
});
