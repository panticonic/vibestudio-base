import { sha256HexSyncText } from "@vibestudio/content-addressing";
import { doltRemotesOf } from "@vibestudio/durable/dolt";
import { FakeDoltStorage } from "@vibestudio/durable/test-dolt";
import { createTestDO } from "@vibestudio/durable/test-utils";
import { expect, it, vi } from "vitest";
import { GadHistoryDO } from "./GadHistoryDO.js";
import * as historyState from "./doltWorkspaceState.js";

it("does not leave an unowned participant reservation when recording its identity fails", async () => {
  const cell = await FakeDoltStorage.create({ doltLocal: ["state", "gad_history_allocations"] });
  const { instance } = await createTestDO(GadHistoryDO, { __objectKey: "canonical" }, { storage: cell.storage });
  const event = vi.spyOn(historyState, "committedWorkspaceEvent")
    .mockReturnValue({ head: cell.dolt.hashOf("main"), eventId: "shared-tip" });
  try {
    cell.sql.exec(`CREATE TRIGGER fail_participant_identity BEFORE INSERT ON state
      WHEN new.key GLOB 'history-allocation-identity:*' BEGIN
        SELECT RAISE(ABORT, 'Participant identity write interrupted');
      END`);
    await expect(instance.reserveHistoryParticipant({ contextId: "context:work", participantId: "writer" }))
      .rejects.toThrow("Participant identity write interrupted");
    expect(cell.sql.exec("SELECT target_key FROM gad_history_allocations").toArray()).toEqual([]);
    await expect(instance.retireHistoryContext({ contextId: "context:work" }))
      .resolves.toEqual({ contextId: "context:work", targets: [], branchOwners: [] });
  } finally {
    event.mockRestore();
  }
});

it("resumes an interrupted reservation at the original fork and returns one grant", async () => {
  const env = { __objectKey: "canonical" };
  const cell = await FakeDoltStorage.create({ doltLocal: ["state", "gad_history_allocations"] });
  const input = { contextId: "context:work", participantId: "writer" };
  const target = `work-${sha256HexSyncText(input.participantId)}`;
  const targetId = `do:workers/workspace-source:GadHistoryDO:${target}`;
  let original: string;
  const event = vi.spyOn(historyState, "committedWorkspaceEvent")
    .mockImplementation((_sql, head) => ({ head, eventId: "shared-tip" }));
  const copies = new Map<string, FakeDoltStorage>();
  let current = cell;
  const create = vi.fn(async (
    _receiver: string,
    method: { name: string },
    [spec]: [{ key: string; forkStorage: { at: string } }],
  ) => {
    expect(method.name).toBe("runtime.createEntity");
    expect(spec.key).toBe(target);
    expect(spec.forkStorage.at).toBe(original);
    if (!copies.has(target)) {
      copies.set(target, await current.fork({ at: spec.forkStorage.at }));
      throw new Error("The host did not receive the completed fork");
    }
    return { targetId };
  });
  async function open(cell: FakeDoltStorage) {
    const { instance } = await createTestDO(GadHistoryDO, env, { storage: cell.storage });
    Object.defineProperty(instance, "rpc", { value: { call: create } });
    return instance;
  }
  try {
    const previous = await open(cell);
    original = cell.dolt.hashOf("main");
    await expect(previous.reserveHistoryParticipant(input)).rejects.toThrow("completed fork");
    current = await cell.restart();
    current.sql.exec("CREATE TABLE later_workspace_revisions (name TEXT PRIMARY KEY)");
    const newer = current.dolt.commit("Advance shared history");
    expect(newer).not.toBe(original);
    const reopened = await open(current);
    const reservations = await Promise.all([
      reopened.reserveHistoryParticipant(input),
      reopened.reserveHistoryParticipant(input),
      reopened.reserveHistoryParticipant(input),
    ]);
    expect(reservations).toEqual(Array(3).fill(reservations[0]));
    expect(reservations[0]).toMatchObject({ targetId, head: original });
    expect(copies.size).toBe(1);
    expect(create).toHaveBeenCalledTimes(2);
    expect(doltRemotesOf(current.storage)?.remote.grants()).toEqual([
      expect.objectContaining({ peer: targetId, label: input.participantId }),
    ]);
    expect(current.dolt.hashOf("main")).toBe(newer);
  } finally {
    event.mockRestore();
  }
});

it("revokes publication grants left by a lost reply when acknowledging the applied event", async () => {
  const cell = await FakeDoltStorage.create({ doltLocal: ["state", "gad_history_allocations"] });
  const { instance } = await createTestDO(GadHistoryDO, { __objectKey: "canonical" }, { storage: cell.storage });
  const previousHead = cell.dolt.hashOf("main");
  cell.dolt.branch.create("candidate");
  cell.dolt.checkout("candidate");
  cell.sql.exec("CREATE TABLE published_revision (name TEXT PRIMARY KEY)");
  const proposedHead = cell.dolt.commit("Publish candidate");
  cell.dolt.checkout("main");
  const participantId = "writer";
  const peer = `do:workers/workspace-source:GadHistoryDO:work-${sha256HexSyncText(participantId)}`;
  Object.defineProperty(instance, "rpc", { value: { call: async () => ({ targetId: peer }) } });
  const committed = vi.spyOn(historyState, "committedWorkspaceEvent")
    .mockImplementation((_sql, head) => ({ head, eventId: head === proposedHead ? "next" : "previous" }));
  const resolve = vi.spyOn(historyState, "workspaceCommitForRef")
    .mockImplementation((_sql, head, state) =>
      head === proposedHead && state.kind === "event" && state.eventId === "next" ? proposedHead : null);
  const request = { publicationId: "publication" };
  try {
    await instance.reserveHistoryParticipant({ participantId, contextId: "context:work" });
    const remote = doltRemotesOf(cell.storage)!.remote;
    const unrelated = remote.grant({ peer, push: ["main"], pushTransition: {
      previous: previousHead, next: "a".repeat(40),
    }, expiresAt: Date.now() + 60_000 });
    instance.authorizeHistoryPublication({
      ...request, participantId, previousEventId: "previous", proposedEventId: "next",
      publication: { previousHead, proposedHead },
    });
    const dropped = instance.grantHistoryPublication(request);
    const retried = instance.grantHistoryPublication(request);
    expect(dropped.kind).toBe("grant");
    expect(retried.kind).toBe("grant");
    expect(() => instance.acknowledgeHistoryPublication(request)).toThrow("no applied revision");
    expect(remote.grants()).toHaveLength(4);
    cell.dolt.merge("candidate");
    expect(instance.listHistoryAppliedPublications()).toMatchObject([
      { approval: { ...request, proposedEventId: "next" }, applied: true },
    ]);
    instance.acknowledgeHistoryPublication(request);
    instance.acknowledgeHistoryPublication(request);
    expect(remote.grants()).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: participantId, peer }),
      expect.objectContaining({ id: unrelated.id, peer }),
    ]));
    expect(remote.grants()).toHaveLength(2);
    expect(instance.listHistoryAppliedPublications()).toEqual([]);
    expect(cell.dolt.hashOf("main")).toBe(proposedHead);
  } finally {
    committed.mockRestore();
    resolve.mockRestore();
  }
});

it("lists the active native contexts after reopening the history store", async () => {
  const cell = await FakeDoltStorage.create({ doltLocal: ["state", "gad_history_allocations"] });
  const env = { __objectKey: "canonical" };
  const options = { storage: cell.storage };
  const { instance } = await createTestDO(GadHistoryDO, env, options);
  for (const contextId of ["ctx:z", "ctx:a", "ctx:retired", "system:setup"]) {
    instance.ensureHistoryRuntimeContext({ contextId });
  }
  await instance.retireHistoryContext({ contextId: "ctx:retired" });

  const { instance: reopened } = await createTestDO(GadHistoryDO, env, options);
  expect(reopened.listHistoryRuntimeContexts({ prefix: "ctx:" })).toEqual(["ctx:a", "ctx:z"]);
  expect(reopened.listHistoryRuntimeContexts({})).toEqual(["ctx:a", "ctx:z", "system:setup"]);
});
