// Builtin semantic-authority tests.
import { describe, expect, it, vi } from "vitest";
import { sha256HexSyncText } from "@vibestudio/content-addressing";

vi.mock("@vibestudio/content-addressing", async (loadOriginal) => {
  const original = await loadOriginal<typeof import("@vibestudio/content-addressing")>();
  return { ...original, sha256HexSyncText: vi.fn(original.sha256HexSyncText) };
});
import { createInMemorySql } from "@vibestudio/durable/test-utils";
import {
  composeFileManifest,
  emptyFileManifest,
  planWorkspaceFactChangeSet,
  workspaceFileStateIdentity,
  workspaceRepositoryStateIdentity,
  type PersistentRadixNode,
} from "@workspace/vcs-engine";
import { createSemanticVcsSchema } from "./semanticVcsSchema.js";
import { SemanticWorkspaceFacts } from "./semanticWorkspaceFacts.js";
import { SemanticVcsStore } from "./semanticVcsStore.js";

async function enumerationFixture(fileCount: number) {
  const sql = await createInMemorySql();
  createSemanticVcsSchema(sql);
  const store = new SemanticVcsStore(sql, () => "2026-10-14T00:00:00.000Z");
  const repositories = Array.from({ length: 3 }, (_, repository) => ({
    repoPath: `packages/repository-${repository}`,
    files: Array.from({ length: repository === 0 ? fileCount : 1 }, (_, file) => ({
      path: `file-${file}.ts`,
      contentHash: "a".repeat(64),
      mode: 0o100644,
      contentKind: "text" as const,
      byteLength: 1,
      coordinateExtent: 1,
    })),
  }));
  const context = store.initializeWorkspace("context:enumeration", "command:enumeration", {
    source: { sourceUri: "fixture://enumeration", snapshotRevision: "v1" },
    repositories,
  });
  return {
    sql,
    store,
    repositories,
    root: context.committed.workspaceFactRootId,
  };
}

describe("SemanticWorkspaceFacts", () => {
  it("enumerates repositories with file-count-independent radix SQL reads", async () => {
    const nodeReadCounts = [];
    for (const fileCount of [1, 1000]) {
      const fixture = await enumerationFixture(fileCount);
      const reads = vi.spyOn(fixture.sql, "exec");
      const entries = fixture.store.facts.entries(fixture.root, "repository");
      const members = entries.map(({ key, value }) => {
        const member = fixture.store.facts.memberByStateId(value);
        expect(member?.repositoryId).toBe(key);
        return member;
      });
      expect(members.map((member) => member?.presence)).toEqual(["present", "present", "present"]);
      expect(
        members.map((member) => (member && "repoPath" in member ? member.repoPath : null)).sort()
      ).toEqual(fixture.repositories.map(({ repoPath }) => repoPath));
      const radixReads = reads.mock.calls.filter(([query]) =>
        /FROM gad_persistent_radix_(?:nodes|edges)/u.test(query)
      ).length;
      nodeReadCounts.push(radixReads);
      expect(radixReads).toBeLessThan(40);
      reads.mockClear();
      fixture.store.recordInitializedRepositoryContentRoots({
        workspaceFactRootId: fixture.root,
        provenanceId: "fixture:enumeration",
        repositories: fixture.repositories.map(({ repoPath }) => ({
          repoPath,
          contentRoot: `state:${"b".repeat(64)}`,
        })),
      });
      expect(
        reads.mock.calls.filter(([query]) =>
          /FROM gad_persistent_radix_(?:nodes|edges)/u.test(query)
        )
      ).toHaveLength(radixReads);
      reads.mockRestore();
      fixture.store.assertIntegrity();
    }
    expect(nodeReadCounts[1]).toBe(nodeReadCounts[0]);
  });

  it("requires complete kind counts while keeping full-root corruption visible to audits", async () => {
    const { sql, store, root } = await enumerationFixture(20);
    const repositories = store.facts.entries(root, "repository");
    expect(store.facts.entries(root, "file")).toHaveLength(22);
    expect(store.facts.entries(root, "live-path")).toHaveLength(3);
    sql.exec(
      `UPDATE vcs_workspace_fact_roots SET repository_count = 4 WHERE workspace_fact_root_id = ?`,
      root
    );
    expect(() => store.facts.entries(root, "repository")).toThrow(/count disagrees/u);
    sql.exec(
      `UPDATE vcs_workspace_fact_roots SET repository_count = 3 WHERE workspace_fact_root_id = ?`,
      root
    );
    // A repository read has no dependency on the file namespace, but the
    // explicit full-root audit must still reject its damaged leaf.
    const leaf = sql
      .exec(`SELECT node_id FROM gad_persistent_radix_edges WHERE entry_key LIKE 'file:%' LIMIT 1`)
      .toArray()[0]?.["node_id"];
    if (!leaf) throw new Error("Fixture has no aggregate file leaf");
    sql.exec(`DELETE FROM gad_persistent_radix_edges WHERE node_id = ?`, leaf);
    expect(store.facts.entries(root, "repository")).toEqual(repositories);
    expect(() => store.facts.assertIndexParity(root)).toThrow(
      /leaf header or edges are malformed/u
    );
  });

  it("retains repository identity binding when recording prepared content roots", async () => {
    const { sql, store, repositories, root } = await enumerationFixture(1);
    const entry = store.facts.entries(root, "repository")[0];
    if (!entry) throw new Error("Fixture has no repository fact");
    sql.exec(
      `UPDATE vcs_repository_states SET repository_id = ? WHERE repository_state_id = ?`,
      "cross-owned-repository",
      entry.value
    );
    expect(() =>
      store.recordInitializedRepositoryContentRoots({
        workspaceFactRootId: root,
        provenanceId: "fixture:enumeration",
        repositories: repositories.map(({ repoPath }) => ({
          repoPath,
          contentRoot: `state:${"b".repeat(64)}`,
        })),
      })
    ).toThrow(/Initialized repository index .* references an unrealized state/u);
  });

  it("persists and reads one normalized workspace fact root", async () => {
    const sql = await createInMemorySql();
    createSemanticVcsSchema(sql);
    const facts = new SemanticWorkspaceFacts(sql);
    const basis = facts.empty();
    const emptyManifest = emptyFileManifest("repo-1");
    const nodes = new Map<string, PersistentRadixNode>([
      [emptyManifest.node.nodeId, emptyManifest.node],
    ]);
    const manifestProof = composeFileManifest({
      basis: emptyManifest.manifest,
      updates: [{ fileId: "file-1", expectedPath: null, resultPath: "src/index.ts" }],
      readNode: (_kind, _route, nodeId) => nodes.get(nodeId) ?? null,
    });
    const repository = workspaceRepositoryStateIdentity({
      repositoryId: "repo-1",
      presence: "present",
      repoPath: "packages/core",
      fileManifestId: manifestProof.resultManifest.fileManifestId,
    });
    const file = workspaceFileStateIdentity({
      fileId: "file-1",
      presence: "placed",
      repositoryId: "repo-1",
      path: "src/index.ts",
      contentHash: "blob-1",
      mode: 0o100644,
      contentKind: "text",
      byteLength: 4,
      coordinateExtent: 4,
    });
    if (repository.presence !== "present" || file.presence !== "placed") {
      throw new Error("fixture identities lost their discriminants");
    }
    sql.exec(
      `INSERT INTO vcs_repository_states
       (repository_state_id, repository_id, repo_path, presence, file_manifest_id,
        prior_repository_state_id, tombstone_change_id)
       VALUES (?, ?, ?, 'present', ?, NULL, NULL)`,
      repository.repositoryStateId,
      repository.repositoryId,
      repository.repoPath,
      repository.fileManifestId
    );
    sql.exec(
      `INSERT INTO vcs_file_states
       (file_state_id, file_id, presence, repository_id, path, content_hash, mode,
        content_kind, byte_length, coordinate_extent, prior_file_state_id, tombstone_change_id)
       VALUES (?, ?, 'placed', ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      file.fileStateId,
      file.fileId,
      file.repositoryId,
      file.path,
      file.contentHash,
      file.mode,
      file.contentKind,
      file.byteLength,
      file.coordinateExtent
    );
    const planned = planWorkspaceFactChangeSet({
      basisWorkspaceFactRootId: basis.workspaceFactRootId,
      repositoryUpdates: [{ repositoryId: "repo-1", expected: null, result: repository }],
      manifestUpdates: [
        {
          repositoryId: "repo-1",
          expectedFileManifestId: null,
          resultManifest: manifestProof.resultManifest,
          pathUpdates: manifestProof.updates,
        },
      ],
      fileUpdates: [{ fileId: "file-1", expected: null, result: file }],
    });
    expect(planned.kind).toBe("planned");
    if (planned.kind !== "planned") return;
    const proof = facts.apply(facts.prepare(planned.changeSet));

    expect(proof.resultRoot.entryCount).toBe(3);
    vi.mocked(sha256HexSyncText).mockClear();
    expect(facts.member(proof.resultRoot.workspaceFactRootId, "repo-1")).toEqual(repository);
    expect(facts.file(proof.resultRoot.workspaceFactRootId, "file-1")?.state).toEqual(file);
    expect(
      facts.fileAtPath(proof.resultRoot.workspaceFactRootId, "repo-1", "src/index.ts")?.state
    ).toEqual(file);
    expect(sha256HexSyncText).not.toHaveBeenCalled();
    expect(() => facts.assertIndexParity(proof.resultRoot.workspaceFactRootId)).not.toThrow();
  });

  it("resolves paged snapshots for several repositories with one batched state read", async () => {
    const sql = await createInMemorySql();
    createSemanticVcsSchema(sql);
    const facts = new SemanticWorkspaceFacts(sql);
    const basis = facts.empty();
    const repositoryUpdates = [];
    const manifestUpdates = [];
    const fileUpdates = [];

    for (const fixture of [
      { repositoryId: "repo-a", repoPath: "packages/a", fileCount: 501 },
      { repositoryId: "repo-b", repoPath: "packages/b", fileCount: 1 },
    ]) {
      const emptyManifest = emptyFileManifest(fixture.repositoryId);
      const manifestNodes = new Map<string, PersistentRadixNode>([
        [emptyManifest.node.nodeId, emptyManifest.node],
      ]);
      const pathUpdates = Array.from(
        { length: fixture.fileCount },
        (_, index) => ({
          fileId: `${fixture.repositoryId}-file-${index.toString().padStart(3, "0")}`,
          expectedPath: null,
          resultPath: `src/file-${index.toString().padStart(3, "0")}.ts`,
        }),
      );
      const manifestProof = composeFileManifest({
        basis: emptyManifest.manifest,
        updates: pathUpdates,
        readNode: (_kind, _route, nodeId) => manifestNodes.get(nodeId) ?? null,
      });
      const repository = workspaceRepositoryStateIdentity({
        repositoryId: fixture.repositoryId,
        presence: "present",
        repoPath: fixture.repoPath,
        fileManifestId: manifestProof.resultManifest.fileManifestId,
      });
      if (repository.presence !== "present")
        throw new Error("repository fixture is absent");
      sql.exec(
        `INSERT INTO vcs_repository_states
         (repository_state_id, repository_id, repo_path, presence, file_manifest_id,
          prior_repository_state_id, tombstone_change_id)
         VALUES (?, ?, ?, 'present', ?, NULL, NULL)`,
        repository.repositoryStateId,
        repository.repositoryId,
        repository.repoPath,
        repository.fileManifestId
      );
      repositoryUpdates.push({
        repositoryId: repository.repositoryId,
        expected: null,
        result: repository,
      });
      manifestUpdates.push({
        repositoryId: repository.repositoryId,
        expectedFileManifestId: null,
        resultManifest: manifestProof.resultManifest,
        pathUpdates: manifestProof.updates,
      });

      for (const [index, pathUpdate] of pathUpdates.entries()) {
        const file = workspaceFileStateIdentity({
          fileId: pathUpdate.fileId,
          presence: "placed",
          repositoryId: repository.repositoryId,
          path: pathUpdate.resultPath,
          contentHash: `blob-${repository.repositoryId}-${index}`,
          mode: 0o100644,
          contentKind: "text",
          byteLength: index + 1,
          coordinateExtent: index + 1,
        });
        if (file.presence !== "placed")
          throw new Error("file fixture is absent");
        sql.exec(
          `INSERT INTO vcs_file_states
           (file_state_id, file_id, presence, repository_id, path, content_hash, mode,
            content_kind, byte_length, coordinate_extent, prior_file_state_id,
            tombstone_change_id)
           VALUES (?, ?, 'placed', ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
          file.fileStateId,
          file.fileId,
          file.repositoryId,
          file.path,
          file.contentHash,
          file.mode,
          file.contentKind,
          file.byteLength,
          file.coordinateExtent
        );
        fileUpdates.push({ fileId: file.fileId, expected: null, result: file });
      }
    }

    const planned = planWorkspaceFactChangeSet({
      basisWorkspaceFactRootId: basis.workspaceFactRootId,
      repositoryUpdates,
      manifestUpdates,
      fileUpdates,
    });
    expect(planned.kind).toBe("planned");
    if (planned.kind !== "planned") return;
    const root = facts.apply(facts.prepare(planned.changeSet)).resultRoot
      .workspaceFactRootId;
    const repositories = repositoryUpdates.map(({ result }) => result);
    const stateReads = vi.spyOn(facts, "fileStatesAt");
    const manifestPages = vi.spyOn(facts, "pageManifest");

    const snapshots = facts.materializationSnapshotsAt(root, repositories);

    expect(stateReads).toHaveBeenCalledTimes(1);
    expect(stateReads.mock.calls[0]![1]).toHaveLength(502);
    expect(manifestPages).toHaveBeenCalledTimes(3);
    expect(snapshots.get("repo-a")).toHaveLength(501);
    expect(snapshots.get("repo-a")?.[0]).toEqual({
      path: "src/file-000.ts",
      contentHash: "blob-repo-a-0",
      mode: 0o100644,
    });
    expect(snapshots.get("repo-a")?.[500]).toEqual({
      path: "src/file-500.ts",
      contentHash: "blob-repo-a-500",
      mode: 0o100644,
    });
    expect(snapshots.get("repo-b")).toEqual([
      {
        path: "src/file-000.ts",
        contentHash: "blob-repo-b-0",
        mode: 0o100644,
      },
    ]);
  });

  it("seeks and pages one lexical fact kind without hydrating the aggregate root", async () => {
    const sql = await createInMemorySql();
    createSemanticVcsSchema(sql);
    const facts = new SemanticWorkspaceFacts(sql);
    const basis = facts.empty();
    const repositoryUpdates = [];
    const fileUpdates = [];
    const repositoryCount = 104;

    for (let index = 0; index < repositoryCount; index += 1) {
      const suffix = index.toString().padStart(3, "0");
      const repository = workspaceRepositoryStateIdentity({
        repositoryId: `repo-${suffix}`,
        presence: "deleted",
        priorRepositoryStateId: `prior-repository-state-${suffix}`,
        tombstoneChangeId: `repository-tombstone-${suffix}`,
      });
      const file = workspaceFileStateIdentity({
        fileId: `file-${suffix}`,
        presence: "deleted",
        priorFileStateId: `prior-file-state-${suffix}`,
        tombstoneChangeId: `file-tombstone-${suffix}`,
      });
      if (repository.presence !== "deleted" || file.presence !== "deleted") {
        throw new Error("fixture identities lost their deleted discriminants");
      }
      sql.exec(
        `INSERT INTO vcs_repository_states
         (repository_state_id, repository_id, repo_path, presence, file_manifest_id,
          prior_repository_state_id, tombstone_change_id)
         VALUES (?, ?, NULL, 'deleted', NULL, ?, ?)`,
        repository.repositoryStateId,
        repository.repositoryId,
        repository.priorRepositoryStateId,
        repository.tombstoneChangeId
      );
      sql.exec(
        `INSERT INTO vcs_file_states
         (file_state_id, file_id, presence, repository_id, path, content_hash, mode,
          content_kind, byte_length, coordinate_extent, prior_file_state_id, tombstone_change_id)
         VALUES (?, ?, 'deleted', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
        file.fileStateId,
        file.fileId,
        file.priorFileStateId,
        file.tombstoneChangeId
      );
      repositoryUpdates.push({
        repositoryId: repository.repositoryId,
        expected: null,
        result: repository,
      });
      fileUpdates.push({ fileId: file.fileId, expected: null, result: file });
    }

    const planned = planWorkspaceFactChangeSet({
      basisWorkspaceFactRootId: basis.workspaceFactRootId,
      repositoryUpdates,
      manifestUpdates: [],
      fileUpdates,
    });
    expect(planned.kind).toBe("planned");
    if (planned.kind !== "planned") return;
    const proof = facts.apply(facts.prepare(planned.changeSet));
    expect(proof.resultRoot).toMatchObject({
      entryCount: repositoryCount * 2,
      repositoryCount,
      livePathCount: 0,
      fileCount: repositoryCount,
    });

    const nodeReads = vi.spyOn(facts, "node");
    const first = facts.page(proof.resultRoot.workspaceFactRootId, "repository", { limit: 2 });

    expect(first).toEqual({
      values: [
        { key: "repo-000", value: repositoryUpdates[0]!.result.repositoryStateId },
        { key: "repo-001", value: repositoryUpdates[1]!.result.repositoryStateId },
      ],
      total: repositoryCount,
      next: "repo-001",
    });
    expect(nodeReads.mock.calls.length).toBeGreaterThan(0);
    expect(nodeReads.mock.calls.length).toBeLessThan(24);

    nodeReads.mockClear();
    expect(
      facts
        .page(proof.resultRoot.workspaceFactRootId, "repository", {
          afterKey: first.next!,
          limit: 2,
        })
        .values.map((entry) => entry.key)
    ).toEqual(["repo-002", "repo-003"]);
    expect(nodeReads.mock.calls.length).toBeLessThan(24);

    expect(
      facts
        .page(proof.resultRoot.workspaceFactRootId, "repository", {
          afterKey: "repo-099",
          limit: 10,
        })
        .values.map((entry) => entry.key)
    ).toEqual(["repo-100", "repo-101", "repo-102", "repo-103"]);
  });
});
