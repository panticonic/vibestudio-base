import { describe, expect, it } from "vitest";
import { createTestDO } from "@workspace/runtime/worker/test-utils";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import type { RpcClient } from "@vibestudio/rpc";
import { QuickfireSessionsDO } from "./index.js";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";

class TestQuickfireSessionsDO extends QuickfireSessionsDO {
  modelSettingsFailure: Error | null = null;
  readonly calls: Array<{ target: string; method: string; args: unknown[] }> =
    [];

  protected override get rpc(): RpcClient {
    const base = super.rpc;
    const mockedMethods = new Set([
      "workers.resolveService",
      "getSettings",
      "workspace-state.panelTree.detail",
      "workspace-state.entity.resolveActive",
      "runtime.createEntity",
      "subscribeChannel",
      "runtime.replaceResourceBindings",
      "runtime.releaseResourceBindings",
      "runtime.retireEntity",
      "interruptChannel",
      "unsubscribeChannel",
    ]);
    const mockedCall = schemaRpcMock({
      call: async (_target: string, method: string, args: unknown[]) => {
        if (method === "workers.resolveService") {
          expect(args).toEqual(["vibestudio.models.v1", null]);
          return durableObjectServiceFixture(
            "do:workers/model-settings:ModelSettingsDO:settings",
            {
              source: "workers/model-settings",
              className: "ModelSettingsDO",
              objectKey: "settings",
            },
          );
        }
        if (method === "getSettings") {
          if (this.modelSettingsFailure) throw this.modelSettingsFailure;
          return {
            defaultAgentConfig: {
              model: "anthropic:connected-model",
              thinkingLevel: "low",
              approvalLevel: 1,
            },
          };
        }
        if (method === "workspace-state.panelTree.detail") {
          const slotId = "panel:tree/slot-a";
          const entityId = "panel:nav-slot-a-current-entity";
          return {
            revision: 1,
            slot: {
              slot_id: slotId,
              parent_slot_id: null,
              current_entity_id: entityId,
              current_entity_title: "Build log",
              current_entry_key: "entry-1",
              sort_key: 0,
              created_at: 1,
              closed_at: null,
            },
            currentHistory: {
              slot_id: slotId,
              cursor: 0,
              entry_key: "entry-1",
              entity_id: entityId,
              context_id: "ctx-panel",
              source: "panels/build-log",
              state_args: "{}",
              recorded_at: 1,
            },
            entity: {
              id: entityId,
              authoritySessionId: "authority-panel",
              kind: "panel",
              source: {
                repoPath: "panels/build-log",
                effectiveVersion: "test",
              },
              contextId: "ctx-panel",
              key: "build-log",
              createdAt: 1,
              status: "active",
              cleanupComplete: false,
            },
          };
        }
        if (method === "workspace-state.entity.resolveActive")
          return {
            id: String(args[0]),
            authoritySessionId: "authority-agent",
            kind: "worker",
            source: {
              repoPath: "workers/agent-worker",
              effectiveVersion: "test",
            },
            contextId: "ctx-panel",
            key: "quickfire-agent",
            createdAt: 1,
            status: "active",
            cleanupComplete: false,
          };
        if (method === "runtime.createEntity") {
          const spec = args[0] as {
            className?: string;
            key?: string;
            source?: string;
            contextId?: string;
            resourceBindings?: unknown[];
          };
          if (spec.className === "AiChatWorker") {
            return {
              id: `do:workers/agent-worker:AiChatWorker:${spec.key}`,
              kind: "worker",
              source: {
                repoPath: spec.source ?? "workers/agent-worker",
                effectiveVersion: "test",
              },
              agentInitialization: { ok: true, participantId: "agent:quickfire" },
              targetId: `do:workers/agent-worker:AiChatWorker:${spec.key}`,
              contextId: spec.resourceBindings
                ? "ctx-panel"
                : (spec.contextId ?? "ctx-panel"),
            };
          }
          return {
            id: "channel-entity",
            kind: "do",
            source: {
              repoPath: spec.source ?? "workers/pubsub-channel",
              effectiveVersion: "test",
            },
            targetId: "channel-target",
            contextId: spec.resourceBindings
              ? "ctx-panel"
              : (spec.contextId ?? "ctx-panel"),
          };
        }
        if (method === "subscribeChannel")
          return { ok: true, participantId: "agent:quickfire" };
        if (
          method === "runtime.replaceResourceBindings" ||
          method === "runtime.releaseResourceBindings" ||
          method === "runtime.retireEntity" ||
          method === "interruptChannel" ||
          method === "unsubscribeChannel"
        ) {
          return undefined;
        }
        throw new Error(`unexpected mocked rpc ${method}`);
      },
    }).call;
    const call: RpcClient["call"] = async (target, method, args, options) => {
      this.calls.push({ target, method: method.name, args });
      if (mockedMethods.has(method.name))
        return mockedCall(target, method, args, options);
      return base.call(target, method, args, options);
    };
    return { ...base, call };
  }
}

describe("QuickfireSessionsDO", () => {
  it("propagates model discovery failure before allocating a channel or agent", async () => {
    const { instance } = await createTestDO(TestQuickfireSessionsDO);
    const failure = new Error("Model settings service disconnected");
    instance.modelSettingsFailure = failure;
    await expect(instance.sessionFor({ slotId: "slot-a" })).rejects.toBe(
      failure,
    );
    expect(
      instance.calls.some(({ method }) => method === "runtime.createEntity"),
    ).toBe(false);
  });

  it("launches an ordinary AI chat agent with declarative prompt, tools, and panel binding", async () => {
    const { instance } = await createTestDO(TestQuickfireSessionsDO);
    const session = await instance.sessionFor({ slotId: "slot-a" });
    const create = instance.calls.find(
      ({ method, args }) =>
        method === "runtime.createEntity" &&
        (args[0] as { className?: string }).className === "AiChatWorker",
    );
    const spec = create?.args[0] as {
      stateArgs: { agentConfig: Record<string, unknown> };
      agentInitialization: { config: Record<string, unknown> };
      resourceBindings: unknown[];
    };
    const channelCreate = instance.calls.find(
      ({ method, args }) =>
        method === "runtime.createEntity" &&
        (args[0] as { className?: string }).className === "PubSubChannel",
    );

    expect(session).toMatchObject({
      slotId: "slot-a",
      channelTargetId: `do:workers/pubsub-channel:PubSubChannel:${session.channelId}`,
      contextId: "ctx-panel",
      state: "fresh",
    });
    expect(spec.stateArgs.agentConfig).toMatchObject({
      model: "anthropic:connected-model",
      thinkingLevel: "low",
      approvalLevel: 1,
    });
    expect(spec.agentInitialization.config).toMatchObject({
      systemPromptMode: "append",
      features: {
        resources: { subject: { kind: "panel-slot", id: "slot-a" } },
        tools: expect.arrayContaining([{ kind: "standard" }]),
      },
    });
    expect(spec.agentInitialization.config["systemPrompt"]).toContain(
      "<initial-panel-context>",
    );
    expect(spec.agentInitialization.config["systemPrompt"]).toContain(
      "title: Build log",
    );
    expect(spec.stateArgs.agentConfig["approvalLevel"]).toBe(1);
    expect(spec.resourceBindings).toEqual([
      {
        resource: { kind: "panel-slot", id: "slot-a" },
        capabilities: ["panel.inspect"],
        scope: { kind: "agent-channel", channelId: session.channelId },
      },
      {
        resource: { kind: "workspace-diagnostics", id: "server-logs" },
        capabilities: ["server-logs.read"],
        scope: { kind: "agent-channel", channelId: session.channelId },
      },
    ]);
    expect(channelCreate?.args[0]).toMatchObject({
      resourceBindings: [
        {
          resource: { kind: "panel-slot", id: "slot-a" },
          capabilities: [],
          scope: { kind: "entity" },
        },
      ],
    });
    expect(channelCreate?.args[0]).not.toHaveProperty("contextId");
    expect(create?.args[0]).not.toHaveProperty("contextId");
  });

  it("resumes the durable session without launching a second agent", async () => {
    const { instance } = await createTestDO(TestQuickfireSessionsDO);
    const first = await instance.sessionFor({ slotId: "slot-a" });
    const resumed = await instance.sessionFor({ slotId: "slot-a" });

    expect(resumed).toMatchObject({
      channelId: first.channelId,
      channelTargetId: first.channelTargetId,
      state: "resumed",
    });
    expect(
      instance.calls.filter(
        ({ method, args }) =>
          method === "runtime.createEntity" &&
          (args[0] as { className?: string }).className === "AiChatWorker",
      ),
    ).toHaveLength(1);
    expect(
      instance.calls.some(
        ({ method }) => method === "runtime.replaceResourceBindings",
      ),
    ).toBe(false);
  });

  it("discovers session identities without reading channel history or inventing message counts", async () => {
    const { instance } = await createTestDO(TestQuickfireSessionsDO);
    const fresh = await instance.sessionFor({ slotId: "slot-a" });
    expect(fresh.messageCount).toBe(0);
    instance.calls.length = 0;

    const resumed = await instance.sessionFor({ slotId: "slot-a" });
    const listed = await instance.list();

    expect(resumed).toMatchObject({ messageCount: null, lastActivityAt: null });
    expect(listed).toEqual([resumed]);
    expect(instance.calls.every(({ target }) => target === "main")).toBe(true);
  });

  it("promotion detaches the panel relationship and keeps the same ordinary agent/channel", async () => {
    const { instance } = await createTestDO(TestQuickfireSessionsDO);
    const session = await instance.sessionFor({ slotId: "slot-a" });
    const promoted = await instance.promote({ slotId: "slot-a" });

    expect(promoted).toMatchObject({
      channelId: session.channelId,
      state: "promoted",
    });
    expect(instance.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "main",
          method: "runtime.releaseResourceBindings",
          args: [{ id: session.agentEntityId }],
        }),
        expect.objectContaining({
          target: "main",
          method: "runtime.releaseResourceBindings",
          args: [
            {
              id: `do:workers/pubsub-channel:PubSubChannel:${session.channelId}`,
            },
          ],
        }),
      ]),
    );
    expect(
      instance.calls.filter(({ method }) => method === "subscribeChannel"),
    ).toHaveLength(0);
    expect(
      instance.calls.some(({ method }) => method === "runtime.retireEntity"),
    ).toBe(false);
  });

  it("clear retires an unpromoted agent", async () => {
    const { instance } = await createTestDO(TestQuickfireSessionsDO);
    const session = await instance.sessionFor({ slotId: "slot-a" });

    await expect(instance.clear({ slotId: "slot-a" })).resolves.toEqual({
      cleared: true,
    });
    expect(instance.calls).toContainEqual({
      target: "main",
      method: "runtime.retireEntity",
      args: [{ id: session.agentEntityId, removeContext: false }],
    });
    expect(instance.calls).toContainEqual({
      target: "main",
      method: "runtime.retireEntity",
      args: [
        {
          id: `do:workers/pubsub-channel:PubSubChannel:${session.channelId}`,
          removeContext: false,
        },
      ],
    });
  });

  it("starting fresh after promotion never retires the transferred agent", async () => {
    const { instance } = await createTestDO(TestQuickfireSessionsDO);
    const original = await instance.sessionFor({ slotId: "slot-a" });
    await instance.promote({ slotId: "slot-a" });
    const fresh = await instance.sessionFor({ slotId: "slot-a", fresh: true });

    expect(fresh.channelId).not.toBe(original.channelId);
    expect(
      instance.calls.some(
        ({ method, args }) =>
          method === "runtime.retireEntity" &&
          (args[0] as { id?: string }).id === original.agentEntityId,
      ),
    ).toBe(false);
  });
});
