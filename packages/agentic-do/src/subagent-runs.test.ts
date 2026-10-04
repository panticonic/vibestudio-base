import { describe, expect, it } from "vitest";
import { createInMemorySql } from "@workspace/runtime/worker/test-utils";
import type { SqlStorage } from "@workspace/runtime/worker";
import { SubagentRunStore, subagentRunReference } from "./subagent-runs.js";

describe("SubagentRunStore schema", () => {
  it("retains terminal results without consuming a live execution slot", async () => {
    const sql = (await createInMemorySql()) as unknown as SqlStorage;
    const store = new SubagentRunStore(sql);
    store.createTables();
    store.insert({
      runId: "run-1",
      nativeTaskId: 1,
      taskChannelId: "task-1",
      parentContextId: "parent-1",
      childContextId: "child-1",
      childEntityId: "entity-1",
      childParticipantId: null,
      parentChannelId: "channel-1",
      mode: "fresh",
      label: "child",
      depth: 1,
      status: "running",
      sourceEventId: null,
      semanticIntegrationSnapshot: { state: "complete" },
      startedAt: 1,
      lastActivityAt: 2,
      launchConfig: { model: "openai-codex:gpt-5.6-luna" },
    });

    expect(store.countLive()).toBe(1);
    store.setStatus("run-1", "completed");

    expect(store.countLive()).toBe(0);
    expect(store.resolveReference("run-1")).toMatchObject({
      kind: "exact",
      run: {
        status: "completed",
        semanticIntegrationSnapshot: { state: "complete" },
      },
    });
    const retained = store.get("run-1")!;
    const runRef = subagentRunReference(retained);
    // Unrelated launches do not evict the retained collaborator's coordinate.
    for (let taskId = 2; taskId <= 300; taskId++) {
      store.insert({
        ...retained,
        runId: `run-${taskId}`,
        nativeTaskId: taskId,
      });
    }
    const cold = new SubagentRunStore(sql);
    cold.createTables();
    expect(runRef).toBe("@s1");
    expect(cold.resolveReference(runRef, "channel-1")?.run).toEqual(retained);
    expect(cold.resolveReference(runRef, "other-channel")).toBeNull();
    expect(cold.resolveReference(retained.runId, "other-channel")).toBeNull();
    for (const invalid of [
      "@s01",
      "@s0",
      "@S1",
      "@s1...",
      "run-",
      "run-1…",
      "@s99999999999999999999",
    ])
      expect(cold.resolveReference(invalid)).toBeNull();
    expect(() => cold.insert({ ...retained, runId: "another-owner" })).toThrow(
      /UNIQUE constraint failed/
    );
    expect(() => cold.insert({ ...retained, nativeTaskId: 301 })).toThrow(
      "changed its native task owner"
    );
    expect(() => cold.insert({ ...retained, runId: "invalid-task", nativeTaskId: 1.5 })).toThrow(
      "positive native task identity"
    );
    cold.insert({ ...retained, status: "running" });
    expect(cold.get(retained.runId)?.status).toBe("completed");
  });

  it("rejects the obsolete merge_status shape instead of migrating it", async () => {
    const sql = (await createInMemorySql()) as unknown as SqlStorage;
    sql.exec(`
      CREATE TABLE subagent_runs (
        run_id TEXT PRIMARY KEY,
        task_channel_id TEXT NOT NULL,
        parent_context_id TEXT,
        child_context_id TEXT NOT NULL,
        child_entity_id TEXT NOT NULL,
        child_participant_id TEXT,
        parent_channel_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        label TEXT NOT NULL,
        depth INTEGER NOT NULL,
        status TEXT NOT NULL,
        merge_status TEXT,
        started_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL,
        agent_kind TEXT,
        external_session_entity_id TEXT
      )
    `);
    const store = new SubagentRunStore(sql);
    expect(() => store.createTables()).toThrow(
      "Unsupported subagent_runs schema; delete this pre-release state"
    );
  });

  it("rejects the previous hand-maintained integration_status shape", async () => {
    const sql = (await createInMemorySql()) as unknown as SqlStorage;
    sql.exec(`
      CREATE TABLE subagent_runs (
        run_id TEXT PRIMARY KEY,
        task_channel_id TEXT NOT NULL,
        parent_context_id TEXT,
        child_context_id TEXT NOT NULL,
        child_entity_id TEXT NOT NULL,
        child_participant_id TEXT,
        parent_channel_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        label TEXT NOT NULL,
        depth INTEGER NOT NULL,
        status TEXT NOT NULL,
        integration_status TEXT,
        started_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL,
        agent_kind TEXT NOT NULL,
        launch_config_json TEXT,
        external_session_entity_id TEXT,
        external_generation_id TEXT
      )
    `);
    const store = new SubagentRunStore(sql);
    expect(() => store.createTables()).toThrow(
      "Unsupported subagent_runs schema; delete this pre-release state"
    );
  });

  it("rejects an invalid status at write time via the schema CHECK", async () => {
    const sql = (await createInMemorySql()) as unknown as SqlStorage;
    const store = new SubagentRunStore(sql);
    store.createTables();
    store.insert({
      runId: "run-1",
      nativeTaskId: 1,
      taskChannelId: "task-1",
      parentContextId: "parent-1",
      childContextId: "child-1",
      childEntityId: "entity-1",
      childParticipantId: null,
      parentChannelId: "channel-1",
      mode: "fresh",
      label: "child",
      depth: 1,
      status: "running",
      sourceEventId: null,
      semanticIntegrationSnapshot: null,
      startedAt: 1,
      lastActivityAt: 2,
      launchConfig: null,
    });
    // `closed` and any other non-live/non-terminal label are rejected by the
    // schema itself — corruption cannot even be persisted.
    expect(() =>
      sql.exec(`UPDATE subagent_runs SET status = 'almost-done' WHERE run_id = 'run-1'`)
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      sql.exec(`UPDATE subagent_runs SET status = 'closed' WHERE run_id = 'run-1'`)
    ).toThrow(/CHECK constraint failed/);
  });

  it("rejects storage that still carries external-agent session fields", async () => {
    const sql = (await createInMemorySql()) as unknown as SqlStorage;
    const store = new SubagentRunStore(sql);
    store.createTables();
    sql.exec("ALTER TABLE subagent_runs ADD COLUMN external_generation_id TEXT");
    expect(() => store.createTables()).toThrow(
      "Unsupported subagent_runs schema; delete this pre-release state"
    );
  });

  it.each([["mode", "sideways"]])("rejects an invalid persisted %s", async (column, value) => {
    const sql = (await createInMemorySql()) as unknown as SqlStorage;
    const store = new SubagentRunStore(sql);
    store.createTables();
    store.insert({
      runId: "run-1",
      nativeTaskId: 1,
      taskChannelId: "task-1",
      parentContextId: "parent-1",
      childContextId: "child-1",
      childEntityId: "entity-1",
      childParticipantId: null,
      parentChannelId: "channel-1",
      mode: "fresh",
      label: "child",
      depth: 1,
      status: "running",
      sourceEventId: null,
      semanticIntegrationSnapshot: null,
      startedAt: 1,
      lastActivityAt: 2,
      launchConfig: null,
    });
    sql.exec(`UPDATE subagent_runs SET ${column} = ? WHERE run_id = 'run-1'`, value);

    expect(() => store.get("run-1")).toThrow(`Invalid subagent_runs.${column}`);
  });
});
