import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { createRpcMethodCaller, type RpcMethodArgs } from "@vibestudio/shared/rpcMethods";
import { gadRpcMethods } from "@vibestudio/service-schemas/clients/durableObjectServiceClient";
import { gadWireMethods } from "@vibestudio/service-schemas/workspaceSource";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import { createNativeVesselTestDO as createTestDO } from "@workspace/agentic-do/testing/native-vessel";
import { createNativeChannelProvider } from "@workspace/agentic-do/testing/native-channel-provider";
import { rpcExposedMethodNames, rpcMethodAuthority } from "@vibestudio/rpc";
import {
  PROVIDER_CREDENTIAL_SETUPS,
  DEFAULT_MODEL,
} from "@workspace/agentic-do";
import type { ChannelReplayEnvelope } from "@workspace/pubsub";

import { AiChatWorker } from "./ai-chat-worker.js";

class TestableAiChatWorker extends AiChatWorker {
  // The fixture routes actual ChannelDO provider deliveries as host RPC.
  protected override get rpcCallerKind(): string | null {
    return "server";
  }
  readonly published: Array<{
    participantId: string;
    event: unknown;
    opts?: unknown;
  }> = [];
  readonly lifecycleLeaseCalls: Array<{ method: string; input: unknown }> = [];
  subscribeEnvelope: ChannelReplayEnvelope = {
    mode: "initial",
    logEvents: [],
    snapshots: [],
    ready: { totalCount: 0, envelopeCount: 0 },
  };
  workspaceAgentsMd: unknown = "WORKSPACE AGENTS";
  workspaceSkills: unknown = [
    {
      name: "onboarding",
      description: "Onboarding skill",
      dirPath: "skills/onboarding",
      skillPath: "skills/onboarding/SKILL.md",
    },
  ];

  readonly rpcCall = vi.fn(
    async (target: string, method: string, args: unknown[]) => {
      if (target === "main" && method === "workspace.getAgentsMd") {
        return this.workspaceAgentsMd;
      }
      if (target === "main" && method === "workspace.listSkills") {
        return this.workspaceSkills;
      }
      if (
        target === "main" &&
        (method === "workspace-state.lifecycleLeaseUpsert" ||
          method === "workspace-state.lifecycleLeaseClear")
      ) {
        this.lifecycleLeaseCalls.push({ method, input: args[0] });
        return undefined;
      }
      if (method === "authority.outstandingAcquisitions")
        return { receipts: [], next: null };
      if (method === "workerLog.write") return undefined;
      throw new Error(`unexpected rpc ${target}.${method}`);
    },
  );

  protected override get rpc(): never {
    return {
      call: this.rpcCall,
    } as never;
  }

  protected override callAgentHost = async <T>(
    method: string,
    _args: unknown[],
  ): Promise<T> => {
    const image = this.loadedImage();
    const value =
      method === "workspace-state.entity.resolveActive"
        ? {
            id: image.runtimeId,
            kind: "do",
            authoritySessionId: "actual-ai-test-owner",
            source: {
              kind: "workspace",
              repoPath: image.source,
              effectiveVersion: "test-ai-image",
            },
            activeExecutionDigest: image.executionDigest,
            className: image.className,
            key: image.objectKey,
            contextId: "ctx-1",
            createdAt: 1,
            status: "active",
            cleanupComplete: false,
          }
        : method === "workspace-state.alarmSourceRegister"
          ? "actual-ai-storage-incarnation"
          : method === "workspace-state.alarmSourcePublish"
            ? "accepted"
            : method === "authority.outstandingAcquisitions"
              ? { receipts: [], next: null }
              : [
                    "workspace-state.lifecycleLeaseUpsert",
                    "workspace-state.lifecycleLeaseClear",
                    "workerLog.write",
                  ].includes(method)
                ? undefined
                : (() => {
                    throw new Error(`unexpected native host method ${method}`);
                  })();
    return value as T;
  };

  protected override callGad<K extends keyof typeof gadRpcMethods & string>(
    method: K,
    ...args: RpcMethodArgs<(typeof gadRpcMethods)[K]>
  ) {
    if (method !== "appendLogEvent") return super.callGad(method, ...args);
    return createRpcMethodCaller(schemaRpcMock({ call: async (_target, _method, inputArgs) => {
      const [input] = gadWireMethods.appendLogEvent.args.parse(inputArgs);
      return {
        logId: input.logId,
        head: input.head,
        headSeq: input.events.length,
        headHash: "test-head-hash",
        envelopes: input.events.map((event, index) => ({
          logId: input.logId, head: input.head, seq: index + 1,
          envelopeId: event.envelopeId ?? `test-envelope:${index}`,
          actor: event.actor, payloadKind: event.payloadKind, payload: event.payload,
          ...(event.causality ? { causality: event.causality } : {}),
          appendedAt: event.appendedAt ?? new Date().toISOString(),
          prevHash: "test-previous-hash", hash: `test-hash:${index}`,
        })),
        published: [],
      };
    } }), "test-gad", gadRpcMethods)(method, args);
  }

  private readonly methodChannels = new Map<
    string,
    ReturnType<typeof createNativeChannelProvider>
  >();
  private methodChannel(channelId: string) {
    let channel = this.methodChannels.get(channelId);
    if (!channel) {
      channel = createNativeChannelProvider({
        channelId,
        participantId: this.participantId(),
        deliver: (...args) => this.onMethodCall(...args),
      });
      this.methodChannels.set(channelId, channel);
    }
    return channel;
  }
  async deliveredMethod(
    channelId: string,
    callId: string,
    method: string,
    args: unknown,
  ) {
    return (await this.methodChannel(channelId)).invoke(callId, method, args);
  }
  async closeMethodChannels() {
    for (const channel of this.methodChannels.values())
      await (await channel).close();
    this.methodChannels.clear();
  }
  protected override createChannelClient(channelId: string) {
    return {
      getEnvelope: async (envelopeId: string) =>
        (await this.methodChannel(channelId)).channel.callAs(
          { callerId: this.participantId(), callerKind: "do" },
          "getEnvelope",
          envelopeId,
        ),
      publishAgenticEvent: async (
        participantId: string,
        event: unknown,
        opts?: unknown,
      ) => {
        this.published.push({ participantId, event, opts });
        return { id: this.published.length };
      },
      relationshipState: async () => ({ revision: 0, active: false }),
      join: async (input: { participantId: string; revision: number }) => ({
        ok: true,
        participantId: input.participantId,
        revision: input.revision,
        channelConfig: undefined,
        envelope: this.subscribeEnvelope,
      }),
      leave: async () => ({ ok: true }),
      getParticipants: async () => [],
      markMethodCallExecutionStarted: async (
        participantId: string,
        callId: string,
        generation: number,
      ) =>
        (await this.methodChannel(channelId)).markExecutionStarted(
          participantId,
          callId,
          generation,
        ),
    } as never;
  }

  credentialSetup(providerId: string) {
    return this.getModelCredentialSetupProps(providerId);
  }

  seedSubscriptionConfig(channelId: string, config: Record<string, unknown>) {
    this.sql.exec(
      `INSERT OR REPLACE INTO subscriptions
         (channel_id, context_id, revision, subscribed_at, config, relationship_json, participant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      channelId,
      "ctx-1",
      1,
      Date.now(),
      JSON.stringify(config),
      "{}",
      `participant:${channelId}`,
    );
  }

  async materializedPrompt(channelId: string): Promise<string> {
    await this.agentSession(BACKGROUND_CONTEXT);
    if (!(await this.admittedNativeChannelConversation(channelId))) {
      await this.subscribeChannel({
        channelId,
        contextId: "ctx-1",
        config: this.subscriptions.getConfig(channelId),
        replay: false,
      });
    }
    await this.ensurePromptArtifacts(channelId);
    const conversation = await this.nativeChannelConversation(channelId);
    const agent = await conversation.agent(BACKGROUND_CONTEXT);
    if (typeof agent.instructions !== "string")
      throw new Error(
        "Native conversation has no committed prompt instructions",
      );
    return agent.instructions;
  }

  promptResourceCallCount(
    method: "workspace.getAgentsMd" | "workspace.listSkills",
  ) {
    return this.rpcCall.mock.calls.filter(
      (call) => call[0] === "main" && call[1] === method,
    ).length;
  }
}

const resources: Array<{
  instance: TestableAiChatWorker;
  db: { close(): void };
}> = [];
afterEach(async () => {
  try {
    const releases = await Promise.allSettled(
      resources.map(({ instance }) =>
        instance.releaseForLifecycle({
          epoch: "test-end",
          mode: "suspend",
          reason: "test",
          deadlineMs: 0,
        }),
      ),
    );
    for (const { instance } of resources) await instance.closeMethodChannels();
    for (const release of releases) {
      if (release.status === "rejected") throw release.reason;
      expect(release.value.status).toBe("ready");
    }
  } finally {
    for (const db of new Set(
      resources.splice(0).map((resource) => resource.db),
    ))
      db.close();
    vi.restoreAllMocks();
  }
});

const admittedImage = {
  WORKER_SOURCE: "workers/agent-worker",
  WORKER_CLASS_NAME: "AiChatWorker",
  WORKER_EXECUTION_DIGEST: "f".repeat(64),
};

async function makeWorker() {
  const resource = await createTestDO(TestableAiChatWorker, {
    ...admittedImage,
    __objectKey: "agent-1",
  });
  resources.push(resource);
  return resource.instance;
}

describe("AiChatWorker", () => {
  it("inherits the finite channel-delivery RPC authority declaration", async () => {
    const worker = await makeWorker();
    expect(rpcExposedMethodNames(worker).has("acceptChannelDelivery")).toBe(
      true,
    );
    expect(rpcMethodAuthority(worker, "acceptChannelDelivery")).toMatchObject({
      website: {
        kind: "closed",
        reason:
          "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
      } as const,
      principals: ["host"],
      effect: { kind: "open" },
      tier: "open",
      sensitivity: "write",
    });
  });

  it("inherits the base agent schema epoch", () => {
    expect(TestableAiChatWorker.schemaVersion).toBe(AiChatWorker.schemaVersion);
  });

  it("reconstructs over its complete sealed durable schema", async () => {
    const first = await createTestDO(TestableAiChatWorker, {
      ...admittedImage,
      __objectKey: "agent-replay",
    });
    resources.push(first);
    expect(
      (
        await first.instance.releaseForLifecycle({
          epoch: "replacement",
          mode: "suspend",
          reason: "test",
          deadlineMs: 0,
        })
      ).status,
    ).toBe("ready");
    const second = await createTestDO(
      TestableAiChatWorker,
      { ...admittedImage, __objectKey: "agent-replay" },
      { db: first.db },
    );
    resources.push(second);
    expect(second.instance).toBeInstanceOf(TestableAiChatWorker);
  });

  it("exposes the shared provider connect presets to the credential flow", async () => {
    const worker = await makeWorker();
    for (const providerId of Object.keys(PROVIDER_CREDENTIAL_SETUPS)) {
      expect(worker.credentialSetup(providerId)).toEqual(
        PROVIDER_CREDENTIAL_SETUPS[providerId],
      );
    }
    expect(worker.credentialSetup("nope")).toBeNull();
  });

  it("commits workspace, skill, and subscription instructions on the actual native conversation", async () => {
    const worker = await makeWorker();
    worker.seedSubscriptionConfig("ch-1", {
      systemPrompt: "CHANNEL CUSTOM",
      systemPromptMode: "append",
    });

    const prompt = await worker.materializedPrompt("ch-1");

    expect(prompt).toContain("Vibestudio is a local workspace");
    expect(prompt).toContain("WORKSPACE AGENTS");
    expect(prompt).toContain("onboarding");
    expect(prompt).toContain("CHANNEL CUSTOM");
    expect(prompt.indexOf("WORKSPACE AGENTS")).toBeLessThan(
      prompt.indexOf("onboarding"),
    );
    expect(prompt.indexOf("onboarding")).toBeLessThan(
      prompt.indexOf("CHANNEL CUSTOM"),
    );
  });

  it("honors a full replacement subscription prompt", async () => {
    const worker = await makeWorker();
    worker.seedSubscriptionConfig("ch-1", {
      systemPrompt: "CHANNEL ONLY",
      systemPromptMode: "replace",
    });

    await expect(worker.materializedPrompt("ch-1")).resolves.toBe(
      "CHANNEL ONLY",
    );
  });

  it("caches workspace prompt resources and refreshes them on request", async () => {
    const worker = await makeWorker();
    worker.seedSubscriptionConfig("ch-1", {});

    await worker.materializedPrompt("ch-1");
    await worker.materializedPrompt("ch-1");
    expect(worker.promptResourceCallCount("workspace.getAgentsMd")).toBe(1);
    expect(worker.promptResourceCallCount("workspace.listSkills")).toBe(1);

    worker.workspaceAgentsMd = "UPDATED WORKSPACE AGENTS";
    const refresh = await worker.deliveredMethod(
      "ch-1",
      "tc-refresh",
      "refreshPromptArtifacts",
      {},
    );

    expect(refresh).toMatchObject({ result: { refreshed: true } });
    expect(worker.promptResourceCallCount("workspace.getAgentsMd")).toBe(2);
    expect(worker.promptResourceCallCount("workspace.listSkills")).toBe(2);
    await expect(worker.materializedPrompt("ch-1")).resolves.toContain(
      "UPDATED WORKSPACE AGENTS",
    );
  });

  it("propagates invalid prompt resources before native publication", async () => {
    const worker = await makeWorker();
    worker.seedSubscriptionConfig("ch-1", {});
    worker.workspaceSkills = { not: "a skill list" };

    await expect(worker.materializedPrompt("ch-1")).rejects.toThrow(
      "workspace.listSkills returned invalid resource shape",
    );

    // Native preparation owns admission failure; this resource helper cannot publish an answer.
    expect(worker.published).toHaveLength(0);

    await expect(worker.materializedPrompt("ch-1")).rejects.toThrow(
      "workspace.listSkills returned invalid resource shape",
    );
    expect(worker.published).toHaveLength(0);
  });

  it("persists live setting changes through the standard agent methods", async () => {
    const worker = await makeWorker();
    const before = await worker.deliveredMethod(
      "ch-1",
      "tc-1",
      "getAgentSettings",
      {},
    );
    expect((before.result as { model: string }).model).toBe(DEFAULT_MODEL);

    const switched = await worker.deliveredMethod("ch-1", "tc-2", "setModel", {
      model: "anthropic:claude-sonnet-4-6",
    });
    expect((switched.result as { model: string }).model).toBe(
      "anthropic:claude-sonnet-4-6",
    );

    // settings survive re-read (Ref-kind KV)
    const after = await worker.deliveredMethod(
      "ch-1",
      "tc-3",
      "getAgentSettings",
      {},
    );
    expect((after.result as { model: string }).model).toBe(
      "anthropic:claude-sonnet-4-6",
    );
    const effort = await worker.deliveredMethod(
      "ch-1",
      "tc-effort",
      "setThinkingLevel",
      {
        level: "max",
      },
    );
    expect((effort.result as { thinkingLevel: string }).thinkingLevel).toBe(
      "max",
    );
    // config is per-AGENT, not per-channel: a sibling channel of the same agent sees the change
    const other = await worker.deliveredMethod(
      "ch-2",
      "tc-4",
      "getAgentSettings",
      {},
    );
    expect((other.result as { model: string }).model).toBe(
      "anthropic:claude-sonnet-4-6",
    );
    expect((other.result as { thinkingLevel: string }).thinkingLevel).toBe(
      "max",
    );
  });

  it("validates standard method arguments", async () => {
    const worker = await makeWorker();
    expect(
      (await worker.deliveredMethod("ch-1", "tc-1", "setModel", {})).isError,
    ).toBe(true);
    expect(
      (
        await worker.deliveredMethod("ch-1", "tc-2", "setThinkingLevel", {
          level: "extreme",
        })
      ).isError,
    ).toBe(true);
    expect(
      (
        await worker.deliveredMethod("ch-1", "tc-3", "setApprovalLevel", {
          level: 9,
        })
      ).isError,
    ).toBe(true);
    expect(
      (
        await worker.deliveredMethod("ch-1", "tc-4", "setRespondPolicy", {
          policy: "sometimes",
        })
      ).isError,
    ).toBe(true);
    expect(
      (await worker.deliveredMethod("ch-1", "tc-5", "unknownMethod", {}))
        .isError,
    ).toBe(true);
  });

  it("applies respond policy with an allow-list", async () => {
    const worker = await makeWorker();
    const result = await worker.deliveredMethod(
      "ch-1",
      "tc-1",
      "setRespondPolicy",
      {
        policy: "from-participants",
        from: ["panel:alice", 42, "panel:bob"],
      },
    );
    expect(result.result).toMatchObject({
      respondPolicy: "from-participants",
      respondFrom: ["panel:alice", "panel:bob"],
    });
  });
});
