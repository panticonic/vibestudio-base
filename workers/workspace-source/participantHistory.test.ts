import { doltRemotesOf } from "@vibestudio/durable/dolt";
import { FakeDoltStorage } from "@vibestudio/durable/test-dolt";
import { expect, it } from "vitest";
import { applyDoltWorkspaceState, createDoltWorkspaceState } from "./doltWorkspaceState.js";
import {
  grantParticipantHistory,
  HistoryHeadChanged,
  ParticipantHistory,
  serveApprovedMain,
} from "./participantHistory.js";

async function workspace() {
  const canonical = await FakeDoltStorage.create();
  canonical.sql.exec("CREATE TABLE files (id TEXT PRIMARY KEY, body TEXT NOT NULL)");
  canonical.sql.exec("INSERT INTO files VALUES ('shared', 'initial')");
  const genesis = canonical.dolt.commit("workspace genesis");
  const origin = doltRemotesOf(canonical.storage)!;
  const transport = async (request: Uint8Array) => origin.remote.serve(request);
  async function createParticipant(id: string) {
    const local = await canonical.fork({ at: genesis });
    const history = new ParticipantHistory(id, local.storage, transport);
    const grant = grantParticipantHistory(origin, id);
    history.connect({ id: canonical.id, token: grant.token });
    return { local, history, head: history.openContext("edit", genesis) };
  }
  const rows = (storage: FakeDoltStorage) =>
    storage.sql.exec("SELECT id, body FROM files ORDER BY id").toArray();
  return { canonical, genesis, origin, transport, createParticipant, rows };
}

it("keeps participant changes private until publication and merges shared changes in the participant", async () => {
  const { canonical, genesis, origin, transport, createParticipant, rows } = await workspace();
  const a = await createParticipant("alice");
  const b = await createParticipant("bob");
  const aliceCommit = a.history.commit("edit", a.head, "Alice edits", () => {
    a.local.sql.exec("UPDATE files SET body = 'alice' WHERE id = 'shared'");
    a.local.sql.exec("INSERT INTO files VALUES ('alice-file', 'new')");
  });
  const bobCommit = b.history.commit("edit", b.head, "Bob edits", () => {
    b.local.sql.exec("UPDATE files SET body = 'bob' WHERE id = 'shared'");
    b.local.sql.exec("INSERT INTO files VALUES ('bob-file', 'new')");
  });

  expect(rows(canonical)).toEqual([{ id: "shared", body: "initial" }]);
  expect(rows(b.local)).toEqual([{ id: "bob-file", body: "new" }, { id: "shared", body: "bob" }]);
  await expect(a.history.publishContext("edit", aliceCommit.head)).resolves.toMatchObject({
    branch: "pub/alice/edit",
    hash: aliceCommit.head,
  });
  const alice = doltRemotesOf(a.local.storage)!;
  await expect(alice.push("origin", "ctx/edit", { to: "main", transport })).rejects.toMatchObject({
    code: "ERR_DOLT_REMOTE_FORBIDDEN",
  });
  await expect(alice.push("origin", "ctx/edit", { to: "pub/bob/edit", transport })).rejects.toMatchObject({
    code: "ERR_DOLT_REMOTE_FORBIDDEN",
  });
  expect(origin.hashOf("main")).toBe(genesis);

  async function publish(history: ParticipantHistory, previousHead: string, proposedHead: string) {
    const approved = origin.remote.grant({ push: ["main"] });
    const publication = { previousHead, proposedHead };
    try {
      return await history.publishApprovedMain(
        "edit",
        publication,
        { id: canonical.id, token: approved.token },
        async (request) => serveApprovedMain(origin, publication, request),
      );
    } finally {
      origin.remote.revoke(approved.id);
    }
  }
  await expect(publish(a.history, genesis, aliceCommit.head)).resolves.toMatchObject({
    hash: aliceCommit.head,
  });
  await expect(publish(b.history, genesis, bobCommit.head)).rejects.toBeInstanceOf(HistoryHeadChanged);

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
  await expect(publish(b.history, aliceCommit.head, merged.hash)).resolves.toMatchObject({
    hash: merged.hash,
  });
  expect(rows(canonical)).toEqual(rows(b.local));
});

it("keeps an existing context and rejects a stale head before running a write", async () => {
  const { genesis, createParticipant } = await workspace();
  const { local, history, head } = await createParticipant("alice");
  const committed = history.commit("edit", head, "edit file", () => {
    local.sql.exec("INSERT INTO files VALUES ('alice-file', 'new')");
    return local.sql.exec("SELECT body FROM files WHERE id = 'alice-file'").one()["body"];
  });
  expect(committed.value).toBe("new");
  expect(history.openContext("edit", genesis)).toBe(committed.head);
  expect(() =>
    history.commit("edit", head, "stale write", () => {
      throw new Error("stale write ran");
    }),
  ).toThrow(HistoryHeadChanged);
  expect(() => history.openContext("../main", genesis)).toThrow("Invalid GAD branch segment");
});

it("commits a prepared placement change atomically, including an exchange of occupied paths", async () => {
  const graph = await FakeDoltStorage.create();
  const sql = graph.sql;
  createDoltWorkspaceState(sql);
  const file = (fileId: string, path: string) => ({
    fileId, path, fileStateId: `${fileId}:${path}`, repositoryId: "repo",
    presence: "placed" as const, contentHash: fileId, mode: 0o644,
    contentKind: "text" as const, byteLength: 1, coordinateExtent: 1,
  });
  const first = file("first", "one");
  const second = file("second", "two");
  applyDoltWorkspaceState(sql, {
    repositoryUpdates: [{
      repositoryId: "repo",
      expected: null,
      result: {
        repositoryId: "repo", repositoryStateId: "genesis-repo", presence: "present",
        repoPath: ".", fileManifestId: "genesis-files",
      },
    }],
    fileUpdates: [first, second].map((result) => ({ fileId: result.fileId, result, expected: null })),
  });
  const genesis = graph.dolt.commit("workspace genesis");
  const work = new ParticipantHistory("alice", graph.storage, async () => {
    throw new Error("Unexpected network operation");
  });
  const head = work.openContext("edit", genesis);
  const switched = work.commit("edit", head, "Exchange paths", () => {
    applyDoltWorkspaceState(sql, {
      repositoryUpdates: [],
      fileUpdates: [
        { fileId: first.fileId, expected: first, result: file(first.fileId, second.path) },
        { fileId: second.fileId, expected: second, result: file(second.fileId, first.path) },
      ],
    });
  });
  const files = () => sql.exec("SELECT file_id, path FROM files ORDER BY file_id").toArray();
  expect(files()).toEqual([{ file_id: "first", path: "two" }, { file_id: "second", path: "one" }]);
  expect(() => work.commit("edit", switched.head, "Occupied path", () => {
    applyDoltWorkspaceState(sql, {
      repositoryUpdates: [],
      fileUpdates: [{ fileId: second.fileId, expected: second, result: file(second.fileId, "two") }],
    });
  })).toThrow();
  expect(graph.dolt.hashOf("HEAD")).toBe(switched.head);
  expect(files()).toEqual([{ file_id: "first", path: "two" }, { file_id: "second", path: "one" }]);
});
