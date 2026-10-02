import { afterEach, describe, expect, it, vi } from "vitest";
import type { RpcClient } from "@vibestudio/rpc";
import type { AgentToolExecutionContext } from "@workspace/agentic-do";
import { createNativeVesselTestDO } from "@workspace/agentic-do/testing/native-vessel";
import { executeTool } from "@workspace/harness/testing/native-tool";
import { MissionAgent } from "./index.js";

const missionsTarget = "do:workers/missions:MissionsDO:workspace-missions";
const controlTarget = "do:workers/mission-control-store:MissionControlStore:main";
const databases = new Set<{ close(): void }>();
afterEach(() => { for (const db of databases) db.close(); databases.clear(); });

class TestMissionAgent extends MissionAgent {
  readonly remote = vi.fn(async (_target: string, method: string, args: unknown[]): Promise<unknown> => {
    if (method === "workers.resolveService") return { kind: "durable-object", targetId: args[0] === "mission-control.v1" ? controlTarget : missionsTarget };
    throw new Error(`Unexpected RPC ${method}`);
  });
  readonly boundRemote = vi.fn(async (_target: string, method: string, args: unknown[]): Promise<unknown> => {
    if (method === "workers.resolveService") return { kind: "durable-object", targetId: controlTarget };
    if (method === "overview") return { tasks: [], total: 0, input: args[0] };
    throw new Error(`Unexpected execution RPC ${method}`);
  });
  protected override get rpc(): RpcClient { return { call: this.remote } as unknown as RpcClient; }
  protected override async bindNativeToolExecution(): Promise<AgentToolExecutionContext> {
    return { invocationId: "test-invocation", commandId: "test-command", rpc: { call: this.boundRemote } as unknown as RpcClient };
  }
  configureSubscription(): void {
    this.sql.exec(
      `INSERT INTO subscriptions
         (channel_id, context_id, revision, subscribed_at, config, relationship_json, participant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      "mission-channel", "mission-context", 1, Date.now(), "{}", "{}", "agent:mission-lead",
    );
  }
  tools() { return this.getTools("mission-channel"); }
}

async function agent() {
  const fixture = await createNativeVesselTestDO(TestMissionAgent, {
    WORKER_SOURCE: "workers/mission-agent", WORKER_CLASS_NAME: "MissionAgent",
    WORKER_SOURCE_REF: `state:${"b".repeat(64)}`, WORKER_EFFECTIVE_VERSION: "a".repeat(64), __objectKey: "task-agent",
  });
  databases.add(fixture.db);
  fixture.instance.configureSubscription();
  return fixture.instance;
}

describe("Mission lead native contracts", () => {
  it("routes its app tool through the invocation-bound RPC client and preserves canonical arguments", async () => {
    const instance = await agent();
    const tool = (await instance.tools()).find(item => item.name === "mission_control");
    expect(tool).toBeDefined();
    const result = await executeTool(tool!, { operation: "overview", input: { limit: 20 } });
    expect(instance.boundRemote).toHaveBeenCalledWith("main", "workers.resolveService", ["mission-control.v1", null]);
    expect(instance.boundRemote).toHaveBeenCalledWith(controlTarget, "overview", [{ limit: 20 }]);
    expect(result.details).toEqual({ tasks: [], total: 0, input: { limit: 20 } });
    expect(instance.remote).not.toHaveBeenCalled();
  });

  it("propagates the original store failure through its native tool", async () => {
    const instance = await agent();
    const failure = new Error("This card changed. Refresh before saving your edit.");
    instance.boundRemote.mockImplementation(async (_target, method) => {
      if (method === "workers.resolveService") return { kind: "durable-object", targetId: controlTarget };
      throw failure;
    });
    const tool = (await instance.tools()).find(item => item.name === "mission_control")!;
    await expect(executeTool(tool, { operation: "updateTask", input: { id: "card", expectedRevision: 1, changes: { title: "Edit" } } })).rejects.toBe(failure);
  });

  it("installs a task automation through Missions using the installed image and a fresh conversation", async () => {
    const instance = await agent();
    instance.remote.mockImplementation(async (_target, method, args) => {
      if (method === "workers.resolveService") return { kind: "durable-object", targetId: missionsTarget };
      if (method === "getDefault") return null;
      if (method === "provisionDefault") return { missionId: "mission-task", state: "active", name: "Ship", charter: (args[1] as { charter: unknown }).charter };
      throw new Error(`Unexpected RPC ${method}`);
    });
    const installed = await instance.installTaskAutomation({ taskId: "task-1", name: "Ship", prompt: "Read the live task and deliver it.", trigger: { kind: "schedule", everyMs: 60000 }, automationId: null });
    expect(installed.missionId).toBe("mission-task");
    expect(instance.remote).toHaveBeenCalledWith(missionsTarget, "getDefault", ["mission-control-task:task-1"]);
    expect(instance.remote).toHaveBeenCalledWith(missionsTarget, "provisionDefault", ["mission-control-task:task-1", {
      name: "Ship",
      charter: expect.objectContaining({
        trigger: { kind: "schedule", everyMs: 60000 },
        execution: expect.objectContaining({
          kind: "agent", image: { source: "workers/mission-agent", ref: `state:${"b".repeat(64)}`, effectiveVersion: "a".repeat(64), className: "MissionAgent", objectKey: "task-agent" },
          conversation: { mode: "fresh" }, action: { kind: "prompt", text: "Read the live task and deliver it." },
        }),
      }),
    }]);
  });

  it("recovers an existing task default after a lost linkage without creating or editing its schedule", async () => {
    const instance = await agent();
    let installed: unknown = null;
    instance.remote.mockImplementation(async (_target, method, args) => {
      if (method === "workers.resolveService") return { kind: "durable-object", targetId: missionsTarget };
      if (method === "getDefault") return installed;
      if (method === "provisionDefault") {
        installed = { missionId: "mission-task", state: "paused", ...(args[1] as object) };
        return installed;
      }
      throw new Error(`Unexpected RPC ${method}`);
    });
    const input = { taskId: "task-1", name: "Task task-1", prompt: "Read the live task and deliver it.", trigger: { kind: "schedule", everyMs: 60000 }, automationId: null };
    const first = await instance.installTaskAutomation(input);
    const restored = await instance.installTaskAutomation(input);
    expect(restored).toEqual(first);
    expect(restored.state).toBe("paused");
    expect(instance.remote.mock.calls.filter(([, method]) => method === "provisionDefault")).toHaveLength(1);
    expect(instance.remote.mock.calls.some(([, method]) => method === "edit")).toBe(false);
  });
});
