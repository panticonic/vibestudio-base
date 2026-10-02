import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDO } from "@vibestudio/durable/test-utils";
import type { RpcClient } from "@vibestudio/rpc";
import { DurableObjectBase } from "@workspace/runtime/worker/kernel";
import { MissionControlStore } from "./index.js";
import type {
  Automation,
  Project,
  Session,
  Task,
} from "@workspace/mission-control";

class TestMissionControlStore extends MissionControlStore {
  readonly remote = vi.fn(
    async (
      _target: string,
      method: string,
      _args: unknown[],
    ): Promise<unknown> => {
      throw new Error(`Unexpected RPC ${method}`);
    },
  );
  protected override get rpc(): RpcClient {
    return { call: this.remote } as unknown as RpcClient;
  }
}

const env = {
  WORKER_SOURCE: "workers/mission-control-store",
  WORKER_CLASS_NAME: "MissionControlStore",
  __objectKey: "main",
};
const databases = new Set<{ close(): void }>();
afterEach(() => {
  for (const db of databases) db.close();
  databases.clear();
  vi.restoreAllMocks();
});
async function createStore() {
  const fixture = await createTestDO(TestMissionControlStore, env);
  databases.add(fixture.db);
  return fixture;
}

async function project(
  store: MissionControlStore,
  name = "Launch",
): Promise<Project> {
  return store.createProject({ name, repos: ["projects/website"] });
}
async function task(
  store: MissionControlStore,
  projectId: string,
  title = "Ship",
  changes: Record<string, unknown> = {},
): Promise<Task> {
  return store.createTask({ projectId, title, ...changes });
}

const missionsTarget = "do:workers/missions:MissionsDO:workspace-missions";
const agentTarget = "do:workers/mission-agent:MissionAgent:task-executor";
function automation(): Automation {
  return {
    missionId: "mission-task",
    name: "Ship",
    state: "active",
    runCount: 0,
    charter: { trigger: { kind: "schedule", everyMs: 60000 } },
    authority: { requestIds: [], grantIds: [], denialIds: [] },
  };
}
function mockAutomationTransport(instance: TestMissionControlStore) {
  const record = automation();
  instance.remote.mockImplementation(async (_target, method) => {
    if (method === "workers.resolveService")
      return { kind: "durable-object", targetId: missionsTarget };
    if (method === "runtime.createEntity") return { targetId: agentTarget };
    if (method === "installTaskAutomation" || method === "get") return record;
    throw new Error(`Unexpected RPC ${method}`);
  });
  return record;
}

describe("Mission Control durable planning", () => {
  it("combines project, work-state, priority, tag, category and text filters without changing the stored cards", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const other = await project(instance, "Elsewhere");
    const fields = {
      status: "review",
      priority: "high",
      category: "Interface",
      tags: ["design"],
      description: "Keyboard accessibility",
    };
    const matching = await task(instance, p.id, "Matching", fields);
    const excluded = [
      await task(instance, other.id, "Wrong project", fields),
      await task(instance, p.id, "Wrong tag", { ...fields, tags: ["backend"] }),
      await task(instance, p.id, "Wrong status", { ...fields, status: "done" }),
      await task(instance, p.id, "Wrong priority", {
        ...fields,
        priority: "low",
      }),
      await task(instance, p.id, "Wrong category", {
        ...fields,
        category: "Infrastructure",
      }),
      await task(instance, p.id, "Wrong query", {
        ...fields,
        description: "Pointer accessibility",
      }),
    ];
    await instance.setView({
      projectId: p.id,
      statuses: ["review"],
      priorities: ["high"],
      tag: "design",
      category: "Interface",
      query: "KEYBOARD",
    });
    expect(instance.overview()).toMatchObject({ tasks: [matching], total: 1 });
    for (const card of [matching, ...excluded])
      expect(instance.getTask({ id: card.id })).toEqual(card);
  });

  it("sorts urgency and recency, and puts undated cards after deadlines", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const clock = vi.spyOn(Date, "now").mockReturnValue(20);
    const normal = await task(instance, p.id, "Normal", {
      priority: "normal",
      dueAt: 5,
    });
    clock.mockReturnValue(1);
    const urgentOld = await task(instance, p.id, "Urgent old", {
      priority: "urgent",
      dueAt: 10,
    });
    clock.mockReturnValue(30);
    const urgentNew = await task(instance, p.id, "Urgent new", {
      priority: "urgent",
      dueAt: null,
    });
    expect(instance.overview().tasks.map((item) => item.id)).toEqual([
      urgentNew.id,
      urgentOld.id,
      normal.id,
    ]);
    await instance.setView({ sort: "updated" });
    expect(instance.overview().tasks.map((item) => item.id)).toEqual([
      urgentNew.id,
      normal.id,
      urgentOld.id,
    ]);
    await instance.setView({ sort: "due" });
    expect(instance.overview().tasks.map((item) => item.id)).toEqual([
      normal.id,
      urgentOld.id,
      urgentNew.id,
    ]);
  });

  it("retains projects, cards, filter state and saved views across a fresh durable object", async () => {
    const first = await createStore();
    const p = await project(first.instance);
    const card = await task(first.instance, p.id, "Accessible launch", {
      priority: "high",
      tags: ["design"],
      category: "Interface",
    });
    const view = await first.instance.setView({
      projectId: p.id,
      tag: "design",
      layout: "list",
      sort: "updated",
    });
    const saved = await first.instance.saveView({
      name: "Design review",
      view,
    });

    const restored = await createTestDO(TestMissionControlStore, env, {
      db: first.db,
    });
    expect(restored.instance.overview()).toMatchObject({
      projects: [p],
      tasks: [card],
      view,
      views: [saved],
      total: 1,
    });
    await restored.instance.removeView({ id: saved.id });
    expect(restored.instance.overview().views).toEqual([]);
    expect(first.instance.overview().views).toEqual([]);
  });

  it("rejects stale edits without losing unrelated human changes", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const card = await task(instance, p.id);
    const edited = await instance.updateTask({
      id: card.id,
      expectedRevision: 1,
      changes: { title: "Ship keyboard navigation" },
    });
    expect(edited).toMatchObject({
      revision: 2,
      title: "Ship keyboard navigation",
    });
    await expect(
      Promise.resolve().then(() =>
        instance.updateTask({
          id: card.id,
          expectedRevision: 1,
          changes: { priority: "urgent" },
        }),
      ),
    ).rejects.toThrow(/changed|revision|refresh/i);
    expect(instance.getTask({ id: card.id })).toEqual(edited);

    const renamed = await instance.updateProject({
      id: p.id,
      expectedRevision: 1,
      changes: { name: "Public launch" },
    });
    await expect(
      Promise.resolve().then(() =>
        instance.updateProject({
          id: p.id,
          expectedRevision: 1,
          changes: { description: "Stale" },
        }),
      ),
    ).rejects.toThrow(/changed|revision|refresh/i);
    expect(instance.overview().projects).toEqual([renamed]);
  });

  it("supports cross-project dependencies and preserves them when a card moves, while rejecting cycles", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const other = await project(instance, "Infrastructure");
    const foundation = await task(instance, other.id, "Foundation");
    const build = await task(instance, p.id, "Build", {
      dependencies: [foundation.id],
    });
    const launch = await task(instance, p.id, "Launch", {
      dependencies: [build.id],
    });
    await expect(
      Promise.resolve().then(() =>
        instance.updateTask({
          id: foundation.id,
          expectedRevision: foundation.revision,
          changes: { dependencies: [launch.id] },
        }),
      ),
    ).rejects.toThrow(/cycle/i);
    expect(instance.getTask({ id: foundation.id }).dependencies).toEqual([]);
    const moved = await instance.updateTask({
      id: build.id,
      expectedRevision: build.revision,
      changes: { projectId: other.id },
    });
    expect(moved).toMatchObject({
      projectId: other.id,
      dependencies: [foundation.id],
    });
    expect(instance.getTask({ id: launch.id }).dependencies).toEqual([
      build.id,
    ]);
    await expect(
      Promise.resolve().then(() =>
        task(instance, p.id, "Missing dependency", {
          dependencies: ["missing"],
        }),
      ),
    ).rejects.toThrow(/exist|unknown/i);
  });

  it("blocks active work until prerequisites are accepted and prevents bypassing cancellation", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const prerequisite = await task(instance, p.id, "Prepare");
    const card = await task(instance, p.id, "Execute", {
      dependencies: [prerequisite.id],
    });
    await expect(
      Promise.resolve().then(() =>
        instance.updateTask({
          id: card.id,
          expectedRevision: card.revision,
          changes: { status: "active" },
        }),
      ),
    ).rejects.toThrow(/dependenc/i);
    await instance.updateTask({
      id: prerequisite.id,
      expectedRevision: prerequisite.revision,
      changes: { status: "done" },
    });
    const active = await instance.updateTask({
      id: card.id,
      expectedRevision: card.revision,
      changes: { status: "active" },
    });
    await expect(
      Promise.resolve().then(() =>
        instance.updateTask({
          id: card.id,
          expectedRevision: active.revision,
          changes: { status: "cancelled" },
        }),
      ),
    ).rejects.toThrow(/cancelTask|execution/i);
    await expect(
      Promise.resolve().then(() =>
        instance.updateProject({
          id: p.id,
          expectedRevision: p.revision,
          changes: { archived: true },
        }),
      ),
    ).rejects.toThrow(/active/i);
  });

  it("filters and pages cards while keeping status counts useful for changing the selected slice", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const other = await project(instance, "Other");
    const a = await task(instance, p.id, "A", {
      status: "review",
      priority: "urgent",
      tags: ["design"],
    });
    const b = await task(instance, p.id, "B", {
      status: "review",
      priority: "high",
      tags: ["design"],
    });
    await task(instance, p.id, "C", { status: "done", tags: ["design"] });
    await task(instance, other.id, "Elsewhere", {
      status: "review",
      priority: "urgent",
      tags: ["design"],
    });
    await instance.setView({
      projectId: p.id,
      statuses: ["review"],
      tag: "design",
    });
    const first = instance.overview({ limit: 1 });
    expect(first).toMatchObject({
      tasks: [a],
      total: 2,
      counts: { review: 2, done: 1 },
    });
    expect(first.cursor).toBeTruthy();
    expect(
      instance.overview({ limit: 1, cursor: first.cursor! }),
    ).toMatchObject({ tasks: [b], cursor: null, total: 2 });
    await instance.setView({ projectId: p.id, statuses: ["done"] });
    expect(() =>
      instance.overview({ limit: 1, cursor: first.cursor! }),
    ).toThrow(/view changed|refresh/i);
  });

  it("offers dependency choices independently of the visible board slice with complete pagination", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const a = await task(instance, p.id, "Design foundation", {
      status: "done",
    });
    const b = await task(instance, p.id, "Design rollout", {
      status: "review",
    });
    await task(instance, p.id, "Unrelated", { status: "inbox" });
    await instance.setView({ statuses: ["inbox"], query: "Unrelated" });
    const first = instance.taskOptions({ query: "design", limit: 1 });
    expect(first.tasks).toHaveLength(1);
    expect(first.cursor).toBeTruthy();
    const next = instance.taskOptions({
      query: "design",
      limit: 1,
      cursor: first.cursor!,
    });
    expect(next.cursor).toBeNull();
    expect(
      [...first.tasks, ...next.tasks].map((item) => item.id).sort(),
    ).toEqual([a.id, b.id].sort());
    expect(instance.overview().tasks.map((item) => item.title)).toEqual([
      "Unrelated",
    ]);
  });

  it("hides archived project work and rejects adding new work until restoration", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const card = await task(instance, p.id);
    const archived = await instance.updateProject({
      id: p.id,
      expectedRevision: p.revision,
      changes: { archived: true },
    });
    expect(instance.overview()).toMatchObject({ tasks: [], total: 0 });
    expect(instance.getTask({ id: card.id })).toEqual(card);
    await expect(
      Promise.resolve().then(() => task(instance, p.id, "New")),
    ).rejects.toThrow(/restore|archiv/i);
    await instance.updateProject({
      id: p.id,
      expectedRevision: archived.revision,
      changes: { archived: false },
    });
    expect(instance.overview().tasks).toEqual([card]);
  });
});

describe("Mission Control canonical execution ledger", () => {
  it("joins cancellation when a human cancels the card during installation without losing the new linkage or edits", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const card = await task(instance, p.id, "Ship", { status: "ready" });
    const record = automation();
    let finishInstall!: (value: Automation) => void;
    let finishCancel!: (value: Automation) => void;
    let enteredInstall!: () => void;
    let enteredCancel!: () => void;
    const installEntered = new Promise<void>((resolve) => {
      enteredInstall = resolve;
    });
    const cancelEntered = new Promise<void>((resolve) => {
      enteredCancel = resolve;
    });
    const installation = new Promise<Automation>((resolve) => {
      finishInstall = resolve;
    });
    const cancellation = new Promise<Automation>((resolve) => {
      finishCancel = resolve;
    });
    instance.remote.mockImplementation(async (_target, method) => {
      if (method === "workers.resolveService")
        return { kind: "durable-object", targetId: missionsTarget };
      if (method === "runtime.createEntity") return { targetId: agentTarget };
      if (method === "installTaskAutomation") {
        enteredInstall();
        return installation;
      }
      if (method === "cancel") {
        enteredCancel();
        return cancellation;
      }
      throw new Error(`Unexpected RPC ${method}`);
    });
    let settled = false;
    const pending = instance
      .configureAutomation({
        id: card.id,
        expectedRevision: card.revision,
        trigger: record.charter.trigger,
      })
      .finally(() => {
        settled = true;
      });
    await installEntered;
    await instance.updateTask({
      id: card.id,
      expectedRevision: card.revision,
      changes: {
        status: "cancelled",
        title: "Stop this rollout",
        tags: ["deferred"],
      },
    });
    finishInstall(record);
    await cancelEntered;
    expect(settled).toBe(false);
    expect(instance.getTask({ id: card.id })).toMatchObject({
      status: "cancelled",
      title: "Stop this rollout",
      tags: ["deferred"],
      automationId: record.missionId,
    });
    expect(instance.remote).toHaveBeenCalledWith(missionsTarget, "cancel", [
      record.missionId,
    ]);
    const paused: Automation = { ...record, state: "paused" };
    finishCancel(paused);
    expect(await pending).toEqual(paused);
    expect(instance.getTask({ id: card.id })).toMatchObject({
      status: "cancelled",
      title: "Stop this rollout",
      tags: ["deferred"],
      automationId: record.missionId,
    });
  });

  it("allows editing an already cancelled linked card without treating its unchanged status as a new cancellation", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const card = await task(instance, p.id);
    const record = mockAutomationTransport(instance);
    await instance.configureAutomation({
      id: card.id,
      expectedRevision: card.revision,
      trigger: record.charter.trigger,
    });
    const linked = instance.getTask({ id: card.id });
    instance.remote.mockImplementation(async (_target, method) => {
      if (method === "workers.resolveService")
        return { kind: "durable-object", targetId: missionsTarget };
      if (method === "cancel") return { ...record, state: "paused" };
      throw new Error(`Unexpected RPC ${method}`);
    });
    const cancelled = await instance.cancelTask({
      id: card.id,
      expectedRevision: linked.revision,
    });
    instance.remote.mockClear();
    const edited = await instance.updateTask({
      id: card.id,
      expectedRevision: cancelled.revision,
      changes: { status: "cancelled", title: "Revisit next quarter" },
    });
    expect(edited).toMatchObject({
      title: "Revisit next quarter",
      status: "cancelled",
      automationId: record.missionId,
      revision: cancelled.revision + 1,
    });
    expect(instance.remote).not.toHaveBeenCalled();
  });

  it("checks authoritative live runs and recurring schedules before archiving a project", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const card = await task(instance, p.id, "Ship", { status: "ready" });
    const record = mockAutomationTransport(instance);
    await instance.configureAutomation({
      id: card.id,
      expectedRevision: card.revision,
      trigger: record.charter.trigger,
    });
    let activeRuns = 1;
    let state = record.state;
    instance.remote.mockImplementation(async (_target, method) => {
      if (method === "workers.resolveService")
        return { kind: "durable-object", targetId: missionsTarget };
      if (method === "overview")
        return { items: [{ automation: { ...record, state }, activeRuns }] };
      throw new Error(`Unexpected RPC ${method}`);
    });
    const input = {
      id: p.id,
      expectedRevision: p.revision,
      changes: { archived: true },
    };
    await expect(instance.updateProject(input)).rejects.toThrow(
      /live execution/i,
    );
    expect(instance.remote).toHaveBeenCalledWith(missionsTarget, "overview", [
      { missionId: record.missionId, limit: 1 },
    ]);
    activeRuns = 0;
    await expect(instance.updateProject(input)).rejects.toThrow(
      /pause recurring/i,
    );
    state = "paused";
    expect(await instance.updateProject(input)).toMatchObject({
      archived: true,
      revision: 2,
    });
  });

  it("serializes remote configuration and rechecks queued revisions before another launch", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const card = await task(instance, p.id);
    const record = automation();
    let finishInstall!: (value: Automation) => void;
    let enteredInstall!: () => void;
    const entered = new Promise<void>((resolve) => {
      enteredInstall = resolve;
    });
    const installation = new Promise<Automation>((resolve) => {
      finishInstall = resolve;
    });
    instance.remote.mockImplementation(async (_target, method) => {
      if (method === "runtime.createEntity") return { targetId: agentTarget };
      if (method === "installTaskAutomation") {
        enteredInstall();
        return installation;
      }
      throw new Error(`Unexpected RPC ${method}`);
    });
    const input = {
      id: card.id,
      expectedRevision: card.revision,
      trigger: record.charter.trigger,
    };
    const first = instance.configureAutomation(input);
    await entered;
    const queued = instance.configureAutomation(input);
    const rejected = expect(queued).rejects.toThrow(
      /changed|revision|refresh/i,
    );
    finishInstall(record);
    expect(await first).toEqual(record);
    await rejected;
    expect(
      instance.remote.mock.calls.filter(
        ([, method]) => method === "installTaskAutomation",
      ),
    ).toHaveLength(1);
    expect(instance.getTask({ id: card.id })).toMatchObject({
      automationId: record.missionId,
      revision: 2,
    });
  });

  it("starts a recurring task manually without replacing its schedule or claiming that the agent has begun work", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const card = await task(instance, p.id, "Ship", { status: "ready" });
    const record = mockAutomationTransport(instance);
    await instance.configureAutomation({
      id: card.id,
      expectedRevision: card.revision,
      trigger: record.charter.trigger,
    });
    const linked = instance.getTask({ id: card.id });
    instance.remote.mockClear();
    const run: Session = {
      runId: "queued-run",
      missionId: record.missionId,
      phase: "preparing",
      startedAt: 100,
    };
    instance.remote.mockImplementation(async (_target, method) => {
      if (method === "workers.resolveService")
        return { kind: "durable-object", targetId: missionsTarget };
      if (method === "runtime.createEntity") return { targetId: agentTarget };
      if (method === "installTaskAutomation" || method === "get") return record;
      if (method === "runNow") return run;
      throw new Error(`Unexpected RPC ${method}`);
    });
    expect(
      await instance.startTask({
        id: card.id,
        expectedRevision: linked.revision,
      }),
    ).toEqual(run);
    expect(instance.remote).toHaveBeenCalledWith(missionsTarget, "runNow", [
      record.missionId,
    ]);
    expect(
      instance.remote.mock.calls.some(
        ([, method]) => method === "installTaskAutomation",
      ),
    ).toBe(false);
    expect(instance.getTask({ id: card.id }).revision).toBe(linked.revision);
    expect(instance.getTask({ id: card.id }).status).toBe("ready");
  });

  it("keeps a card actionable until authoritative cancellation has joined every live run", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const card = await task(instance, p.id, "Ship", { status: "active" });
    const record = mockAutomationTransport(instance);
    await instance.configureAutomation({
      id: card.id,
      expectedRevision: card.revision,
      trigger: record.charter.trigger,
    });
    const linked = instance.getTask({ id: card.id });
    let resolveCancellation!: (value: unknown) => void;
    let enteredCancellation!: () => void;
    const entered = new Promise<void>((resolve) => {
      enteredCancellation = resolve;
    });
    const joined = new Promise<unknown>((resolve) => {
      resolveCancellation = resolve;
    });
    instance.remote.mockImplementation(async (_target, method) => {
      if (method === "workers.resolveService")
        return { kind: "durable-object", targetId: missionsTarget };
      if (method === "cancel") {
        enteredCancellation();
        return joined;
      }
      throw new Error(`Unexpected RPC ${method}`);
    });
    const pending = instance.cancelTask({
      id: card.id,
      expectedRevision: linked.revision,
    });
    await entered;
    expect(instance.getTask({ id: card.id }).status).toBe("active");
    expect(instance.remote).toHaveBeenCalledWith(missionsTarget, "cancel", [
      record.missionId,
    ]);
    resolveCancellation({ ...record, state: "paused" });
    expect(await pending).toMatchObject({ id: card.id, status: "cancelled" });
    expect(
      instance.remote.mock.calls.some(
        ([, method]) => method === "interruptChannel",
      ),
    ).toBe(false);
  });

  it("preserves a user's status edit made while cancellation joins the executor", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const card = await task(instance, p.id, "Ship", { status: "active" });
    const record = mockAutomationTransport(instance);
    await instance.configureAutomation({
      id: card.id,
      expectedRevision: card.revision,
      trigger: record.charter.trigger,
    });
    const linked = instance.getTask({ id: card.id });
    let finishCancellation!: (value: unknown) => void;
    let enteredCancellation!: () => void;
    const entered = new Promise<void>((resolve) => {
      enteredCancellation = resolve;
    });
    const joined = new Promise<unknown>((resolve) => {
      finishCancellation = resolve;
    });
    instance.remote.mockImplementation(async (_target, method) => {
      if (method === "workers.resolveService")
        return { kind: "durable-object", targetId: missionsTarget };
      if (method === "cancel") {
        enteredCancellation();
        return joined;
      }
      throw new Error(`Unexpected RPC ${method}`);
    });
    const pending = instance.cancelTask({
      id: card.id,
      expectedRevision: linked.revision,
    });
    await entered;
    const edited = instance.updateTask({
      id: card.id,
      expectedRevision: linked.revision,
      changes: { status: "review", title: "Human review" },
    });
    const conflict = expect(pending).rejects.toThrow(
      /execution stopped.*state changed/i,
    );
    finishCancellation({ ...record, state: "paused" });
    await conflict;
    expect(instance.getTask({ id: card.id })).toEqual(edited);
  });

  it("reads outcomes and conversation coordinates from Missions with canonical pagination arguments", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const card = await task(instance, p.id);
    const record = mockAutomationTransport(instance);
    await instance.configureAutomation({
      id: card.id,
      expectedRevision: card.revision,
      trigger: record.charter.trigger,
    });
    const run: Session = {
      runId: "run-1",
      missionId: record.missionId,
      phase: "terminal",
      outcome: "completed",
      startedAt: 100,
      finishedAt: 200,
      channelId: "channel-task",
      contextId: "context-task",
      finalMessage: "Delivered with evidence",
    };
    const cursor = { startedAt: 50, runId: "older" };
    instance.remote.mockImplementation(async (_target, method) => {
      if (method === "workers.resolveService")
        return { kind: "durable-object", targetId: missionsTarget };
      if (method === "get") return record;
      if (method === "listRuns") return { items: [run], nextCursor: cursor };
      throw new Error(`Unexpected RPC ${method}`);
    });
    const page = await instance.taskDetail({ id: card.id, cursor });
    expect(page).toMatchObject({ automation: record, runs: [run], cursor });
    expect(instance.remote).toHaveBeenCalledWith(missionsTarget, "get", [
      record.missionId,
    ]);
    expect(instance.remote).toHaveBeenCalledWith(missionsTarget, "listRuns", [
      record.missionId,
      { limit: 20, cursor },
    ]);
    expect(page.task.status).toBe("inbox");
  });

  it("propagates a ledger failure without replacing it with an empty history", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const card = await task(instance, p.id);
    const record = mockAutomationTransport(instance);
    await instance.configureAutomation({
      id: card.id,
      expectedRevision: card.revision,
      trigger: record.charter.trigger,
    });
    const failure = new Error("Canonical run ledger unavailable");
    instance.remote.mockImplementation(async (_target, method) => {
      if (method === "workers.resolveService")
        return { kind: "durable-object", targetId: missionsTarget };
      if (method === "get") return record;
      throw failure;
    });
    await expect(instance.taskDetail({ id: card.id })).rejects.toBe(failure);
    expect(instance.getTask({ id: card.id }).automationId).toBe(
      record.missionId,
    );
  });
});

class LegacyMissionControlStore extends DurableObjectBase {
  static override schemaVersion = 1;
  protected override createTables(): void {
    this.sql
      .exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), data TEXT NOT NULL);
      CREATE INDEX tasks_project ON tasks(project_id);
      CREATE TABLE views (id TEXT PRIMARY KEY, data TEXT NOT NULL);`);
  }
  protected override requiredTables(): readonly string[] {
    return ["projects", "tasks", "views"];
  }
}

describe("Mission Control planning detail and focused views", () => {
  it("upgrades the genuine schema-one database and preserves old cards, views and unrelated metadata", async () => {
    const first = await createTestDO(LegacyMissionControlStore, env);
    databases.add(first.db);
    const legacyProject = {
      id: "p",
      name: "Legacy",
      description: "",
      repos: ["projects/site"],
      color: "blue",
      revision: 7,
      archived: false,
      createdAt: 1,
      updatedAt: 3,
    };
    const legacyTask = {
      id: "t",
      projectId: "p",
      title: "Existing work",
      description: "",
      status: "review",
      priority: "normal",
      category: "",
      tags: [],
      dependencies: [],
      dueAt: null,
      historyMode: "overview",
      revision: 12,
      automationId: null,
      createdAt: 1,
      updatedAt: 5,
    };
    const legacyView = {
      projectId: "p",
      query: "",
      statuses: [],
      priorities: [],
      tag: "",
      category: "",
      layout: "list",
      sort: "updated",
    };
    first.sql.exec(
      "INSERT INTO projects VALUES (?,?)",
      "p",
      JSON.stringify(legacyProject),
    );
    first.sql.exec(
      "INSERT INTO tasks VALUES (?,?,?)",
      "t",
      "p",
      JSON.stringify(legacyTask),
    );
    first.sql.exec(
      "INSERT INTO state VALUES (?,?)",
      "view",
      JSON.stringify(legacyView),
    );
    first.sql.exec(
      "INSERT INTO views VALUES (?,?)",
      "v",
      JSON.stringify({ id: "v", name: "Old slice", view: legacyView }),
    );
    const probe = await createStore();
    const descriptor = {
      className: "MissionControlStore",
      version: 2,
      freshSchemaFingerprint: String(
        probe.sql.exec("SELECT shape_json FROM _vibestudio_schema").one()
          ["shape_json"],
      ),
    };
    const restored = await createTestDO(
      TestMissionControlStore,
      { ...env, VIBESTUDIO_SCHEMA_DESCRIPTOR: descriptor },
      { db: first.db },
    );
    expect(restored.instance.getTask({ id: "t" })).toEqual({
      ...legacyTask,
      checklist: [],
    });
    expect(restored.instance.overview()).toMatchObject({
      tasks: [{ ...legacyTask, checklist: [] }],
      view: {
        ...legacyView,
        timezone: "UTC",
        due: "any",
        execution: "any",
        blocked: false,
      },
      views: [
        { id: "v", name: "Old slice", view: { timezone: "UTC", due: "any" } },
      ],
    });
    expect((await restored.instance.taskDetail({ id: "t" })).activity).toEqual(
      [],
    );
    const changed = restored.instance.updateTask({
      id: "t",
      expectedRevision: 12,
      changes: { checklist: [{ id: "step", text: "Review", done: true }] },
    });
    expect(changed.revision).toBe(13);
    expect(
      (await restored.instance.taskDetail({ id: "t" })).activity,
    ).toMatchObject([{ kind: "updated", changedFields: ["checklist"] }]);
  });

  it("persists checklist edits with revision checks and atomically records each accepted planning write", async () => {
    const fixture = await createStore();
    const p = await project(fixture.instance);
    const card = await task(fixture.instance, p.id, "Launch", {
      checklist: [{ id: "a", text: "Check", done: false }],
    });
    const changed = fixture.instance.updateTask({
      id: card.id,
      expectedRevision: 1,
      changes: {
        status: "ready",
        checklist: [{ id: "a", text: "Check", done: true }],
      },
    });
    expect(() =>
      fixture.instance.updateTask({
        id: card.id,
        expectedRevision: 1,
        changes: { checklist: [] },
      }),
    ).toThrow(/changed/i);
    const restored = await createTestDO(TestMissionControlStore, env, {
      db: fixture.db,
    });
    expect(restored.instance.getTask({ id: card.id })).toEqual(changed);
    const detail = await restored.instance.taskDetail({ id: card.id });
    expect(detail.activity).toMatchObject([
      { kind: "updated", changedFields: ["status", "checklist"] },
      { kind: "created" },
    ]);
    fixture.sql.exec(
      "CREATE TRIGGER reject_event BEFORE INSERT ON task_events BEGIN SELECT RAISE(ABORT,'event unavailable'); END",
    );
    expect(() =>
      fixture.instance.updateTask({
        id: card.id,
        expectedRevision: 2,
        changes: { title: "Uncommitted" },
      }),
    ).toThrow(/event unavailable/i);
    expect(fixture.instance.getTask({ id: card.id })).toEqual(changed);
    expect(
      (await fixture.instance.taskDetail({ id: card.id })).activity,
    ).toEqual(detail.activity);
  });

  it("adds notes without overwriting concurrent card fields and pages immutable activity by canonical event sequence", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const card = await task(instance, p.id);
    for (let index = 0; index < 25; index++)
      instance.addNote({ id: card.id, text: `  Context ${index}  ` });
    expect(instance.getTask({ id: card.id })).toEqual(card);
    const first = await instance.taskDetail({ id: card.id });
    expect(first.activity).toHaveLength(20);
    expect(first.activity[0]).toMatchObject({
      kind: "note",
      text: "Context 24",
    });
    expect(first.activityCursor).toBeTruthy();
    const second = await instance.taskDetail({
      id: card.id,
      activityCursor: first.activityCursor!,
    });
    expect(second.activity).toHaveLength(6);
    expect(second.activityCursor).toBeNull();
    expect(
      new Set([...first.activity, ...second.activity].map((event) => event.id))
        .size,
    ).toBe(26);
    expect(second.activity.at(-1)).toMatchObject({ kind: "created" });
    expect(() => instance.addNote({ id: card.id, text: " " })).toThrow();
    await expect(
      instance.taskDetail({ id: card.id, activityCursor: "0 OR 1=1" }),
    ).rejects.toThrow();
  });

  it("duplicates planning fields into a fresh unlinked inbox card without copying notes, execution or checklist acceptance", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const dependency = await task(instance, p.id, "Prepare");
    const card = await task(instance, p.id, "Ship", {
      status: "ready",
      priority: "high",
      tags: ["launch"],
      category: "Product",
      description: "Scope",
      dependencies: [dependency.id],
      dueAt: 500,
      checklist: [{ id: "accepted", text: "Verify", done: true }],
    });
    const record = mockAutomationTransport(instance);
    await instance.configureAutomation({
      id: card.id,
      expectedRevision: 1,
      trigger: record.charter.trigger,
    });
    const linked = instance.getTask({ id: card.id });
    instance.addNote({ id: card.id, text: "Prior context" });
    instance.remote.mockClear();
    const copy = instance.duplicateTask({
      id: card.id,
      expectedRevision: linked.revision,
    });
    expect(copy).toMatchObject({
      title: "Ship (copy)",
      status: "inbox",
      automationId: null,
      revision: 1,
      description: "Scope",
      dependencies: [dependency.id],
      priority: "high",
      tags: ["launch"],
      category: "Product",
      dueAt: 500,
      checklist: [{ text: "Verify", done: false }],
    });
    expect(copy.id).not.toBe(card.id);
    expect(copy.checklist[0]!.id).not.toBe("accepted");
    expect(await instance.taskDetail({ id: copy.id })).toMatchObject({
      automation: null,
      runs: [],
      activity: [{ kind: "duplicated", sourceTaskId: card.id }],
      dependencies: [dependency],
    });
    expect(instance.remote).not.toHaveBeenCalled();
    expect(instance.getTask({ id: card.id })).toEqual(linked);
    expect(() =>
      instance.duplicateTask({ id: card.id, expectedRevision: 1 }),
    ).toThrow(/changed/i);
  });

  it("filters due dates in the persisted timezone across DST and keeps accepted or cancelled work out of overdue", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-03-29T12:00:00Z"));
    const before = await task(instance, p.id, "Late", {
      dueAt: Date.parse("2026-03-28T22:59:59Z"),
    });
    const today = await task(instance, p.id, "Today", {
      dueAt: Date.parse("2026-03-28T23:00:00Z"),
    });
    const tomorrow = await task(instance, p.id, "Tomorrow", {
      dueAt: Date.parse("2026-03-29T22:00:00Z"),
    });
    const end = await task(instance, p.id, "Next week", {
      dueAt: Date.parse("2026-04-04T22:00:00Z"),
    });
    const undated = await task(instance, p.id, "Undated");
    await task(instance, p.id, "Accepted", {
      status: "done",
      dueAt: before.dueAt,
    });
    await task(instance, p.id, "Cancelled", {
      status: "cancelled",
      dueAt: before.dueAt,
    });
    const select = (due: "today" | "overdue" | "week" | "none") => {
      instance.setView({ due, timezone: "Europe/Berlin" });
      return instance
        .overview()
        .tasks.map((task) => task.id)
        .sort();
    };
    expect(select("today")).toEqual([today.id]);
    expect(select("overdue")).toEqual([before.id]);
    expect(select("week")).toEqual([today.id, tomorrow.id].sort());
    expect(select("none")).toEqual([undated.id]);
    expect(instance.getTask({ id: end.id }).dueAt).toBe(end.dueAt);
  });

  it("offers complete project facets independently of search and exposes live cross-project dependency summaries", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const other = await project(instance, "Other");
    const prerequisite = await task(instance, other.id, "Foundation", {
      category: "Infrastructure",
      tags: ["hidden"],
    });
    const a = await task(instance, p.id, "Match", {
      category: "Interface",
      tags: ["design"],
      dependencies: [prerequisite.id],
    });
    const b = await task(instance, p.id, "Elsewhere", {
      category: "Operations",
      tags: ["release"],
      status: "done",
    });
    instance.setView({
      projectId: p.id,
      query: "Match",
      category: "Interface",
      blocked: true,
    });
    expect(instance.overview()).toMatchObject({
      tasks: [a],
      facets: {
        categories: ["Interface", "Operations"],
        tags: ["design", "release"],
      },
      dependencySummaries: {
        [a.id]: { total: 1, done: 0, blockedIds: [prerequisite.id] },
      },
    });
    expect((await instance.taskDetail({ id: a.id })).dependencies).toEqual([
      prerequisite,
    ]);
    instance.updateTask({
      id: prerequisite.id,
      expectedRevision: 1,
      changes: { status: "done" },
    });
    expect(instance.overview().tasks).toEqual([]);
    instance.setView({ projectId: p.id });
    expect(instance.overview().dependencySummaries).toMatchObject({
      [a.id]: { total: 1, done: 1, blockedIds: [] },
      [b.id]: { total: 0, done: 0, blockedIds: [] },
    });
  });

  it("filters automation linkage without copying or guessing canonical run states", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const linked = await task(instance, p.id);
    const unlinked = await task(instance, p.id);
    const record = mockAutomationTransport(instance);
    await instance.configureAutomation({
      id: linked.id,
      expectedRevision: 1,
      trigger: record.charter.trigger,
    });
    instance.remote.mockClear();
    instance.setView({ execution: "linked" });
    expect(instance.overview().tasks.map((task) => task.id)).toEqual([
      linked.id,
    ]);
    instance.setView({ execution: "unlinked" });
    expect(instance.overview().tasks.map((task) => task.id)).toEqual([
      unlinked.id,
    ]);
    expect(instance.remote).not.toHaveBeenCalled();
    const detail = await instance.taskDetail({ id: unlinked.id });
    expect(detail.activity).toMatchObject([{ kind: "created" }]);
  });

  it("renames and updates a saved view without duplicating it, and rejects an obsolete saved identity", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const saved = instance.saveView({
      name: "Before",
      view: { projectId: p.id },
    });
    const next = instance.saveView({
      id: saved.id,
      name: "After",
      view: {
        projectId: p.id,
        blocked: true,
        layout: "agenda",
        timezone: "Europe/Berlin",
      },
    });
    expect(instance.overview().views).toEqual([next]);
    expect(next.id).toBe(saved.id);
    expect(() =>
      instance.saveView({ id: "missing", name: "Lost", view: {} }),
    ).toThrow(/no longer exists/i);
    expect(() =>
      instance.saveView({ name: "Unknown", view: { projectId: "missing" } }),
    ).toThrow(/project/i);
  });
});

describe("Mission Control active project selection", () => {
  it("archives the selected project atomically with clearing its selection while retaining filters and historical saved views", async () => {
    const fixture = await createStore();
    const p = await project(fixture.instance);
    const other = await project(fixture.instance, "Other");
    await task(fixture.instance, p.id, "Old", { category: "Product" });
    const visible = await task(fixture.instance, other.id, "Visible", { category: "Product" });
    const view = fixture.instance.setView({ projectId: p.id, category: "Product", layout: "agenda", due: "any", timezone: "Europe/Berlin" });
    const saved = fixture.instance.saveView({ name: "Historical project", view });
    fixture.sql.exec("CREATE TRIGGER reject_view BEFORE INSERT ON state WHEN NEW.key='view' BEGIN SELECT RAISE(ABORT,'view unavailable'); END");
    await expect(fixture.instance.updateProject({ id: p.id, expectedRevision: 1, changes: { archived: true } })).rejects.toThrow(/view unavailable/);
    expect(fixture.instance.overview()).toMatchObject({ projects: [expect.objectContaining({ archived: false }), expect.objectContaining({ archived: false })], view });
    fixture.sql.exec("DROP TRIGGER reject_view");
    const archived = await fixture.instance.updateProject({ id: p.id, expectedRevision: 1, changes: { archived: true } });
    expect(fixture.instance.overview()).toMatchObject({ view: { ...view, projectId: null }, tasks: [visible], views: [saved] });
    expect(() => fixture.instance.setView(saved.view)).toThrow(/restore.*project/i);
    expect(fixture.instance.overview().view.projectId).toBeNull();
    expect(fixture.instance.saveView({ id: saved.id, name: "Retained reference", view: saved.view }).view.projectId).toBe(p.id);
    await fixture.instance.updateProject({ id: p.id, expectedRevision: archived.revision, changes: { archived: false } });
    expect(fixture.instance.setView(saved.view)).toEqual(saved.view);
  });

  it("preserves a different project selection made while canonical archive checks are pending", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const other = await project(instance, "Other");
    const card = await task(instance, p.id);
    const record = mockAutomationTransport(instance);
    await instance.configureAutomation({ id: card.id, expectedRevision: 1, trigger: record.charter.trigger });
    instance.setView({ projectId: p.id });
    let enter!: () => void;
    let finish!: (value: unknown) => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const checked = new Promise<unknown>(resolve => { finish = resolve; });
    instance.remote.mockImplementation(async (_target, method) => {
      if (method === "workers.resolveService") return { kind: "durable-object", targetId: missionsTarget };
      if (method === "overview") { enter(); return checked; }
      throw new Error(`Unexpected RPC ${method}`);
    });
    const pending = instance.updateProject({ id: p.id, expectedRevision: 1, changes: { archived: true } });
    await entered;
    const selected = instance.setView({ projectId: other.id, layout: "list", query: "Current focus" });
    finish({ items: [{ automation: { ...record, state: "paused" }, activeRuns: 0 }] });
    expect(await pending).toMatchObject({ archived: true });
    expect(instance.overview().view).toEqual(selected);
  });

  it("clears a legacy archived selection during the trusted schema upgrade while preserving saved references", async () => {
    const legacy = await createTestDO(LegacyMissionControlStore, env);
    databases.add(legacy.db);
    const p = { id: "archived", name: "Past", description: "", repos: [], color: "blue", revision: 2, archived: true, createdAt: 1, updatedAt: 2 };
    const view = { projectId: p.id, query: "Retained", statuses: ["review"], priorities: [], tag: "", category: "", layout: "list", sort: "updated" };
    legacy.sql.exec("INSERT INTO projects VALUES (?,?)", p.id, JSON.stringify(p));
    legacy.sql.exec("INSERT INTO state VALUES (?,?)", "view", JSON.stringify(view));
    legacy.sql.exec("INSERT INTO views VALUES (?,?)", "past", JSON.stringify({ id: "past", name: "Past view", view }));
    const probe = await createStore();
    const descriptor = { className: "MissionControlStore", version: 2, freshSchemaFingerprint: String(probe.sql.exec("SELECT shape_json FROM _vibestudio_schema").one()["shape_json"]) };
    const restored = await createTestDO(TestMissionControlStore, { ...env, VIBESTUDIO_SCHEMA_DESCRIPTOR: descriptor }, { db: legacy.db });
    expect(restored.instance.overview()).toMatchObject({ view: { ...view, projectId: null }, views: [{ id: "past", view: { projectId: p.id } }] });
  });
});


describe("Mission Control activity language", () => {
  it("describes real brief, deadline and session presentation edits in the task UI's language", async () => {
    const { instance } = await createStore();
    const p = await project(instance);
    const card = await task(instance, p.id, "Review delivery", { status: "ready" });
    const edited = instance.updateTask({ id: card.id, expectedRevision: card.revision, changes: { description: "Evidence for human review", dueAt: Date.UTC(2026, 10, 1), historyMode: "conversation", checklist: [{ id: "verify", text: "Verify delivery", done: false }] } });
    const activity = (await instance.taskDetail({ id: card.id })).activity[0]!;
    expect(activity.summary).toContain("Brief updated");
    expect(activity.summary).toContain("Due date updated");
    expect(activity.summary).toContain("Session presentation updated");
    expect(activity.summary).toContain("Acceptance checklist updated");
    expect(activity.summary).not.toMatch(/Description|DueAt|HistoryMode/);
    instance.updateTask({ id: card.id, expectedRevision: edited.revision, changes: { status: "review" } });
    expect((await instance.taskDetail({ id: card.id })).activity[0]!.summary).toBe("Status: Ready → Needs review");
  });
});
