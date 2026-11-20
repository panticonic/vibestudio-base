import { sha256HexSyncText } from "@vibestudio/content-addressing";
import { doltRemotesOf } from "@vibestudio/durable/dolt";
import { FakeDoltStorage } from "@vibestudio/durable/test-dolt";
import type { VcsEditInput } from "@vibestudio/service-schemas/vcs";
import { expect, it } from "vitest";
import {
  applyDoltWorkspaceState,
  createDoltWorkspaceState,
  workspaceEditBasisAt,
} from "./doltWorkspaceState.js";
import { readHistoryWorkUnitIntent } from "./doltMergeReview.js";
import {
  grantApprovedMain,
  grantExactHistoryTransition,
  grantParticipantHistory,
  HistoryHeadChanged,
  ParticipantHistory,
  retireParticipantHistory,
} from "./participantHistory.js";
import { SemanticWorkspace } from "./semanticWorkspace.js";
import { SemanticProvenanceWriter } from "./semanticProvenanceWriter.js";
import type { WorkUnitRecord } from "./semanticVcsStore.js";

async function workspace(now = Date.now) {
  const canonical = await FakeDoltStorage.create({ now });
  canonical.sql.exec(
    "CREATE TABLE files (id TEXT PRIMARY KEY, body TEXT NOT NULL)",
  );
  canonical.sql.exec("INSERT INTO files VALUES ('shared', 'initial')");
  const genesis = canonical.dolt.commit("workspace genesis");
  const origin = doltRemotesOf(canonical.storage)!;
  const transport = async (request: Uint8Array) => origin.remote.serve(request);
  async function createParticipant(id: string) {
    const local = await canonical.fork({ at: genesis });
    const history = new ParticipantHistory(id, local.storage, transport);
    const grant = grantParticipantHistory(origin, id);
    const target = { id: canonical.id, token: grant.token };
    const head = await history.bindContext("edit", target);
    return { local, history, target, head };
  }
  const rows = (storage: FakeDoltStorage) =>
    storage.sql.exec("SELECT id, body FROM files ORDER BY id").toArray();
  return { canonical, genesis, origin, transport, createParticipant, rows };
}

it("reads captured intent from the native revision and derives intent for older rows", async () => {
  const graph = await FakeDoltStorage.create();
  const sql = graph.sql;
  createDoltWorkspaceState(sql);
  const work: WorkUnitRecord = {
    workUnitId: "legacy-work", commandId: "command", kind: "edit",
    authoredChangeIds: [], intentSummary: null, authorContextId: "edit",
    triggerEvidence: null, externalSnapshot: null, contentClass: "internal",
    externalKeys: [], normalizationProtocol: "test", createdAt: "2026-01-01T00:00:00.000Z",
  };
  const writer = new SemanticProvenanceWriter(sql);
  writer.persistWorkUnit(work);
  writer.persistWorkUnit({ ...work, workUnitId: "indexed-work", intentSummary: "Fix the note" }, {
    text: "Fix the note", tier: "stated",
  });
  const revision = graph.dolt.commit("Native intent");
  const reads: string[] = [];
  const historicalSql = {
    exec(query: string, at: unknown, ...bindings: unknown[]) {
      expect(at).toBe(revision);
      reads.push(query);
      return sql.exec(query.replace(/(dolt_at_\w+)\(\?\)/u, `$1('${revision}')`), ...bindings);
    },
  };
  expect(readHistoryWorkUnitIntent(historicalSql, revision, "indexed-work")).toEqual({
    text: "Fix the note", tier: "stated",
  });
  expect(reads).toHaveLength(1);
  expect(readHistoryWorkUnitIntent(historicalSql, revision, "legacy-work")).toEqual({
    text: "edit decision with no fact transition", tier: "mechanical",
  });
  expect(reads).toHaveLength(3);
});

it("keeps participant changes private until publication and merges shared changes in the participant", async () => {
  const { canonical, genesis, origin, transport, createParticipant, rows } =
    await workspace();
  const a = await createParticipant("alice");
  const b = await createParticipant("bob");
  const aliceCommit = await a.history.commit(
    "edit",
    a.head,
    "Alice edits",
    () => {
      a.local.sql.exec("UPDATE files SET body = 'alice' WHERE id = 'shared'");
      a.local.sql.exec("INSERT INTO files VALUES ('alice-file', 'new')");
    },
  );
  const bobCommit = await b.history.commit("edit", b.head, "Bob edits", () => {
    b.local.sql.exec("UPDATE files SET body = 'bob' WHERE id = 'shared'");
    b.local.sql.exec("INSERT INTO files VALUES ('bob-file', 'new')");
  });

  const reopened = new ParticipantHistory("alice", a.local.storage, transport);
  await expect(reopened.bindContext("edit", a.target)).resolves.toBe(aliceCommit.head);
  expect(rows(canonical)).toEqual([{ id: "shared", body: "initial" }]);
  expect(rows(b.local)).toEqual([
    { id: "bob-file", body: "new" },
    { id: "shared", body: "bob" },
  ]);
  await expect(
    a.history.publishContext("edit", aliceCommit.head),
  ).resolves.toMatchObject({
    branch: "pub/alice/edit",
    hash: aliceCommit.head,
  });
  const alice = doltRemotesOf(a.local.storage)!;
  await expect(
    alice.push("origin", "ctx/edit", { to: "main", transport }),
  ).rejects.toMatchObject({
    code: "ERR_DOLT_REMOTE_FORBIDDEN",
  });
  await expect(
    alice.push("origin", "ctx/edit", { to: "pub/bob/edit", transport }),
  ).rejects.toMatchObject({
    code: "ERR_DOLT_REMOTE_FORBIDDEN",
  });
  expect(origin.hashOf("main")).toBe(genesis);

  async function publish(
    history: ParticipantHistory,
    previousHead: string,
    proposedHead: string,
  ) {
    const publication = { previousHead, proposedHead };
    const approved = grantApprovedMain(origin, publication);
    try {
      return await history.publishApprovedMain(
        "edit",
        publication,
        { id: canonical.id, token: approved.token },
      );
    } finally {
      origin.remote.revoke(approved.id);
    }
  }
  await expect(
    publish(a.history, genesis, aliceCommit.head),
  ).resolves.toMatchObject({
    hash: aliceCommit.head,
  });
  await expect(
    publish(b.history, genesis, bobCommit.head),
  ).rejects.toBeInstanceOf(HistoryHeadChanged);

  let resolutions = 0;
  const merged = await b.history.mergeMain("edit", bobCommit.head, {
    resolve(merge) {
      for (const conflict of merge.conflicts) {
        resolutions++;
        conflict.keepOurs();
      }
    },
  });
  expect(resolutions).toBe(1);
  expect(merged.fastForward).toBe(false);
  expect(origin.hashOf("main")).toBe(aliceCommit.head);
  expect(rows(b.local)).toEqual([
    { id: "alice-file", body: "new" },
    { id: "bob-file", body: "new" },
    { id: "shared", body: "bob" },
  ]);
  await expect(
    publish(b.history, aliceCommit.head, merged.hash),
  ).resolves.toMatchObject({
    hash: merged.hash,
  });
  expect(rows(canonical)).toEqual(rows(b.local));
});

it("merges an exact prefix of a published context without moving shared history", async () => {
  const { genesis, origin, createParticipant, rows } = await workspace();
  const a = await createParticipant("alice");
  const b = await createParticipant("bob");
  const first = await a.history.commit("edit", a.head, "First edit", () => {
    a.local.sql.exec("INSERT INTO files VALUES ('first', 'first revision')");
  });
  const second = await a.history.commit("edit", first.head, "Second edit", () => {
    a.local.sql.exec("INSERT INTO files VALUES ('second', 'second revision')");
  });
  const source = { participantId: "alice", contextId: "edit", head: first.head };
  await expect(
    b.history.mergeContext("edit", b.head, source, { resolve() {} }),
  ).rejects.toMatchObject({ code: "ERR_DOLT_REMOTE_NOT_FOUND" });
  await a.history.publishContext("edit", second.head);
  const merged = await b.history.mergeContext("edit", b.head, source, { resolve() {} });
  expect(merged.hash).toBe(first.head);
  expect(rows(b.local)).toEqual([
    { id: "first", body: "first revision" },
    { id: "shared", body: "initial" },
  ]);
  expect(origin.hashOf("main")).toBe(genesis);
});

it("keeps an existing context and rejects a stale head before running a write", async () => {
  const { genesis, createParticipant } = await workspace();
  const { local, history, head } = await createParticipant("alice");
  const committed = await history.commit("edit", head, "edit file", () => {
    local.sql.exec("INSERT INTO files VALUES ('alice-file', 'new')");
    return local.sql
      .exec("SELECT body FROM files WHERE id = 'alice-file'")
      .one()["body"];
  });
  expect(committed.value).toBe("new");
  await expect(history.openContext("edit", genesis)).resolves.toBe(
    committed.head,
  );
  await expect(
    history.commit("edit", head, "stale write", () => {
      throw new Error("stale write ran");
    }),
  ).rejects.toBeInstanceOf(HistoryHeadChanged);
  await expect(history.openContext("", genesis)).rejects.toThrow(
    "Missing GAD branch identity",
  );
  const encodedHead = await history.openContext("context:lineage/one", genesis);
  expect(encodedHead).toBe(genesis);
  expect(local.dolt.branch.list().map(({ name }) => name)).toContainEqual(
    expect.stringMatching(/^ctx\/id-[a-f0-9]{64}$/u),
  );
  await expect(
    history.forkContext("edit", committed.head, "child"),
  ).resolves.toBe(committed.head);
  await expect(history.discard("edit", committed.head, genesis)).resolves.toBe(
    genesis,
  );
  expect(local.dolt.hashOf("ctx/child")).toBe(committed.head);
  expect(local.dolt.hashOf("ctx/edit")).toBe(genesis);
  await expect(history.discard("edit", genesis, committed.head)).rejects.toThrow(
    "Committed tip is outside context edit",
  );
  expect(local.dolt.hashOf("ctx/edit")).toBe(genesis);
});

it("archives only committed work and preserves it across a failed retirement", async () => {
  const { canonical, genesis, origin, createParticipant } = await workspace();
  const { local, history, head } = await createParticipant("alice");
  await createParticipant("bob");
  await history.openContext("integrated", genesis);
  const committed = await history.commit("edit", head, "Save work", () => {
    local.sql.exec("UPDATE files SET body = 'committed'");
  });
  const working = await history.commit("edit", committed.head, "Apply edit", () => {
    local.sql.exec("UPDATE files SET body = 'working changes'");
  });
  const grants = () => origin.remote.grants().map((item) => item.label).sort();
  const archived = () => origin.branch.list().filter(({ name }) => name.startsWith("retired/"));
  let destroyed = false;
  await expect(retireParticipantHistory(
    origin,
    "alice",
    (token, main) => history.archiveCommittedContexts(
      [{ contextId: "integrated", head: working.head }],
      main,
      { id: canonical.id, token },
    ),
    async () => { destroyed = true; },
  )).rejects.toThrow("Committed tip is outside context integrated");
  expect(grants()).toEqual(["alice", "bob"]);
  expect(archived()).toEqual([]);
  expect(destroyed).toBe(false);

  async function retire() {
    await retireParticipantHistory(
      origin,
      "alice",
      (token, main) => history.archiveCommittedContexts(
        [{ contextId: "edit", head: committed.head }, { contextId: "integrated", head: genesis }],
        main,
        { id: canonical.id, token },
      ),
      async () => {
        expect(grants()).toEqual(["bob"]);
        if (!destroyed) {
          destroyed = true;
          throw new Error("Cell removal interrupted");
        }
      },
    );
  }
  await expect(retire()).rejects.toThrow("Cell removal interrupted");
  await expect(retire()).resolves.toBeUndefined();
  expect(archived()).toMatchObject([{ name: "retired/alice/edit", hash: committed.head }]);
  expect(origin.hashOf("main")).toBe(genesis);
  expect(local.dolt.hashOf("ctx/edit")).toBe(working.head);
});

it("commits a prepared placement change atomically, including an exchange of occupied paths", async () => {
  const graph = await FakeDoltStorage.create();
  const sql = graph.sql;
  createDoltWorkspaceState(sql);
  const file = (fileId: string, path: string) => ({
    fileId,
    path,
    fileStateId: `${fileId}:${path}`,
    repositoryId: "repo",
    presence: "placed" as const,
    contentHash: fileId,
    mode: 0o644,
    contentKind: "text" as const,
    byteLength: 1,
    coordinateExtent: 1,
  });
  const first = file("first", "one");
  const second = file("second", "two");
  applyDoltWorkspaceState(sql, {
    repositoryUpdates: [
      {
        repositoryId: "repo",
        expected: null,
        result: {
          repositoryId: "repo",
          repositoryStateId: "genesis-repo",
          presence: "present",
          repoPath: ".",
          fileManifestId: "genesis-files",
        },
      },
    ],
    fileUpdates: [first, second].map((result) => ({
      fileId: result.fileId,
      result,
      expected: null,
    })),
  });
  const genesis = graph.dolt.commit("workspace genesis");
  const work = new ParticipantHistory("alice", graph.storage, async () => {
    throw new Error("Unexpected network operation");
  });
  const head = await work.openContext("edit", genesis);
  const switched = await work.commit("edit", head, "Exchange paths", () => {
    applyDoltWorkspaceState(sql, {
      repositoryUpdates: [],
      fileUpdates: [
        {
          fileId: first.fileId,
          expected: first,
          result: file(first.fileId, second.path),
        },
        {
          fileId: second.fileId,
          expected: second,
          result: file(second.fileId, first.path),
        },
      ],
    });
  });
  const files = () =>
    sql.exec("SELECT file_id, path FROM files ORDER BY file_id").toArray();
  expect(files()).toEqual([
    { file_id: "first", path: "two" },
    { file_id: "second", path: "one" },
  ]);
  await expect(
    work.commit("edit", switched.head, "Occupied path", () => {
      applyDoltWorkspaceState(sql, {
        repositoryUpdates: [],
        fileUpdates: [
          {
            fileId: second.fileId,
            expected: second,
            result: file(second.fileId, "two"),
          },
        ],
      });
    }),
  ).rejects.toThrow();
  expect(graph.dolt.hashOf("HEAD")).toBe(switched.head);
  expect(files()).toEqual([
    { file_id: "first", path: "two" },
    { file_id: "second", path: "one" },
  ]);
});

it("reads edit placements at the selected revision without changing the checkout", async () => {
  const graph = await FakeDoltStorage.create();
  const { sql } = graph;
  createDoltWorkspaceState(sql);
  sql.exec("INSERT INTO repositories VALUES ('repo', 'projects/example', 'present', NULL)");
  const original = sha256HexSyncText("a");
  sql.exec(
    "INSERT INTO files VALUES ('file', 'repo', 'note.txt', ?, 420, 'text', 1, 1, 'placed', NULL)",
    original,
  );
  const genesis = graph.dolt.commit("workspace genesis");
  const history = new ParticipantHistory("alice", graph.storage, async () => {
    throw new Error("Unexpected network operation");
  });
  await history.openContext("edit", genesis);
  await history.openContext("other", genesis);
  const other = await history.commit("other", genesis, "Change other copy", () => {
    sql.exec("UPDATE files SET content_hash = ? WHERE file_id = 'file'", "b".repeat(64));
  });
  const input: VcsEditInput = {
    commandId: "change-mode",
    contextId: "edit",
    expectedWorkingHead: { kind: "event", eventId: "genesis" },
    changes: [{ kind: "file-mode", repositoryId: "repo", fileId: "file", mode: 0o755 }],
  };
  const historicalSql = {
    exec(query: string, revision: unknown, ...bindings: unknown[]) {
      // This fixture implements literal revisions for Dolt time travel.
      expect(revision).toBe(genesis);
      const withRevision = query.replace(/(dolt_at_\w+)\(\?\)/u, `$1('${genesis}')`);
      return sql.exec(withRevision, ...bindings);
    },
  };
  const basis = workspaceEditBasisAt(historicalSql, genesis);
  const plan = SemanticWorkspace.planEdit(input, null, basis);
  expect(plan).toMatchObject({
    fileResults: [
      {
        fileId: "file",
        expected: { contentHash: original, mode: 0o644 },
        result: { contentHash: original, mode: 0o755 },
      },
    ],
  });
  const text: VcsEditInput = {
    ...input,
    changes: [{
      kind: "text-edit",
      repositoryId: "repo",
      fileId: "file",
      edits: [{ start: 0, end: 1, text: "z" }],
    }],
  };
  expect(SemanticWorkspace.editContentHashes(text, basis)).toEqual([original]);
  expect(() => SemanticWorkspace.planEdit(
    text,
    { files: [{ contentHash: original, base64: "Yg==" }] },
    basis,
  )).toThrow("Observed content differs");
  expect(SemanticWorkspace.planEdit(
    text,
    { files: [{ contentHash: original, base64: "YQ==" }] },
    basis,
  )).toMatchObject({
    fileResults: [{ expected: { contentHash: original }, result: { contentHash: sha256HexSyncText("z") } }],
  });
  expect(graph.dolt.branch.current()).toBe("ctx/other");
  expect(graph.dolt.hashOf("HEAD")).toBe(other.head);
});

it("rejects an approved main publication after its grant expires", async () => {
  let now = Date.now();
  const { canonical, genesis, origin, createParticipant } = await workspace(() => now);
  const { local, history, head } = await createParticipant("alice");
  const proposed = await history.commit("edit", head, "Approved edit", () => {
    local.sql.exec("UPDATE files SET body = 'approved' WHERE id = 'shared'");
  });
  const publication = { previousHead: genesis, proposedHead: proposed.head };
  const grant = grantApprovedMain(origin, publication);
  expect(grant.expiresAt).toBeGreaterThan(now);
  now = grant.expiresAt!;
  await expect(
    history.publishApprovedMain("edit", publication, { id: canonical.id, token: grant.token }),
  ).rejects.toMatchObject({ code: "ERR_DOLT_REMOTE_FORBIDDEN" });
  expect(origin.hashOf("main")).toBe(genesis);
});

it("admits a reviewed incoming head without advancing or exposing main", async () => {
  const { canonical, genesis, origin, createParticipant } = await workspace();
  const { local, history, head } = await createParticipant("alice");
  const proposed = await history.commit("edit", head, "Incoming edit", () => {
    local.sql.exec("UPDATE files SET body = 'incoming' WHERE id = 'shared'");
  });
  const publication = { previousHead: genesis, proposedHead: proposed.head };
  const branch = `incoming/${sha256HexSyncText("signed publication")}`;
  const peer = "origin:exact-publication";
  origin.branch.create(branch, { from: genesis });
  const grant = grantExactHistoryTransition(origin, branch, publication, Date.now() + 5_000, peer);
  const sender = doltRemotesOf(local.storage)!;
  sender.remote.add("incoming", { id: canonical.id, token: grant.token });
  const push = (to: string, requester: string) =>
    sender.push("incoming", "ctx/edit", {
      to,
      transport: async (request) => origin.remote.serve(request, { peer: requester }),
    });
  await expect(push(branch, "origin:other-publication")).rejects.toMatchObject({
    code: "ERR_DOLT_REMOTE_FORBIDDEN",
  });
  await expect(push("main", peer)).rejects.toMatchObject({ code: "ERR_DOLT_REMOTE_FORBIDDEN" });
  await expect(push(branch, peer)).resolves.toMatchObject({ hash: proposed.head });
  expect(origin.hashOf("main")).toBe(genesis);
  expect(origin.hashOf(branch)).toBe(proposed.head);
  const readGrant = grantParticipantHistory(origin, "alice");
  sender.remote.add("ordinary", { id: canonical.id, token: readGrant.token });
  await expect(sender.fetch("ordinary", {
    branches: [branch],
    transport: async (request) => origin.remote.serve(request),
  })).rejects.toMatchObject({ code: "ERR_DOLT_REMOTE_NOT_FOUND" });
});

it("holds the approved revision while a fresh edit waits behind publication", async () => {
  const { canonical, genesis, origin, createParticipant } = await workspace();
  const { local, history, head } = await createParticipant("alice");
  const proposed = await history.commit("edit", head, "Approved edit", () => {
    local.sql.exec("UPDATE files SET body = 'approved' WHERE id = 'shared'");
  });
  const publication = { previousHead: genesis, proposedHead: proposed.head };
  const grant = grantApprovedMain(origin, publication);
  let markStarted!: () => void;
  let resumePush!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const continuing = new Promise<void>((resolve) => {
    resumePush = resolve;
  });
  const delayed = new ParticipantHistory("alice", local.storage, async (request) => {
      markStarted();
      await continuing;
      return origin.remote.serve(request);
    });
  const pushing = delayed.publishApprovedMain(
    "edit", publication, { id: canonical.id, token: grant.token },
  );
  await started;
  const editing = delayed.commit("edit", proposed.head, "Later edit", () => {
    local.sql.exec("UPDATE files SET body = 'later' WHERE id = 'shared'");
  });
  resumePush();
  await expect(pushing).resolves.toMatchObject({ hash: proposed.head });
  const later = await editing;
  expect(origin.hashOf("main")).toBe(proposed.head);
  expect(later.head).not.toBe(proposed.head);
});
