import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import {
  authenticateWorkspaceFileState,
  workspaceFileStateIdentity,
  workspaceRepositoryStateIdentity,
} from "./workspaceFactChangeSet.js";
import {
  authenticatePersistentRadixNode,
  composePersistentRadix,
  emptyPersistentRadixRoot,
  persistentRadixEntryAt,
} from "./persistentRadix.js";

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

  it("builds identities once and traverses stored trees without hashing them again", () => {
    const empty = emptyPersistentRadixRoot("local-index", "utf16");
    vi.mocked(sha256HexSyncText).mockClear();
    const proof = composePersistentRadix({
      basis: empty.root,
      updates: Array.from({ length: 64 }, (_, index) => ({
        key: `file-${index}`,
        expectedValue: null,
        resultValue: `state-${index}`,
      })),
      readNode: (_kind, _route, nodeId) => (nodeId === empty.node.nodeId ? empty.node : null),
    });
    expect(sha256HexSyncText).toHaveBeenCalledTimes(proof.createdNodes.length);
    const nodes = new Map(proof.createdNodes.map((node) => [node.nodeId, node]));
    vi.mocked(sha256HexSyncText).mockClear();
    expect(
      persistentRadixEntryAt({
        root: proof.resultRoot,
        key: "file-32",
        readNode: (_kind, _route, nodeId) => nodes.get(nodeId) ?? null,
      })
    ).toEqual({ key: "file-32", value: "state-32" });
    expect(sha256HexSyncText).not.toHaveBeenCalled();
    expect(() =>
      authenticatePersistentRadixNode({ ...proof.createdNodes[0]!, nodeId: "wrong-id" }, "")
    ).toThrow("failed content authentication");
  });
});
