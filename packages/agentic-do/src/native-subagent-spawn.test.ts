import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";
import { createMainRpcCaller } from "@vibestudio/service-schemas/mainRpc";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createModels,
  fauxProvider,
  fauxAssistantMessage,
  Type,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  copyJson,
  type Context,
  type JsonValue,
  type JsonRepresentation,
} from "@panticonic/pi-chord";
import {
  createRegistry,
  bindReceipt,
  acceptReceipt,
  defineExtension,
  defineTool,
  MemoryStorage,
  type Harness,
  type Conversation,
  type TaskId,
  type ToolExecutionApi,
  type ToolRegistration,
  type JsonObject,
} from "@panticonic/pi-durable";
import type { RpcClient, RpcCallOptions } from "@vibestudio/rpc";
import { wireClientFor } from "@vibestudio/rpc/internal";
import type { ParticipantDescriptor } from "@workspace/harness";
import type { ServerLogEvent as ChannelEvent } from "@workspace/pubsub";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  AGENTIC_PROTOCOL_VERSION,
  type AgenticEvent,
  agenticEventSchema,
} from "@workspace/agentic-protocol";
import { contextIdForTargetKey } from "@vibestudio/shared/runtime/contextIdentity";
import { AgentVesselBase } from "./agent-vessel.js";
import {
  openPlatformAgentSession,
  retireBoundAgentSession,
} from "./native-agent-session.js";
import {
  bindNativeToolInvocation,
  type NativeInvocationExecution,
} from "./native-invocation-boundary.js";
import {
  openNativeChannelConversation,
  submitNativeChannelDelivery,
} from "./native-channel-session.js";
import type { ChannelClient } from "./channel-client.js";
import { createNativeVesselTestDO } from "./testing/native-vessel.js";
import { createNativeChannelPublication } from "./native-channel-publication.js";
import { retainNativeSubagentTerminal } from "./native-subagent-terminal.js";

function detached<T>(value: T): JsonRepresentation<T> {
  return copyJson(value, {
    omitUndefinedProperties: true,
  }) as JsonRepresentation<T>;
}
const context = BACKGROUND_CONTEXT;
const channelId = "parent-channel";
const owner = {
  runtimeId: "do:workers/test:TestAgent:parent",
  contextId: "parent-context",
  incarnation: "parent-storage",
  authoritySessionId: "parent-lifetime",
};
const image = {
  runtimeId: owner.runtimeId,
  source: "workers/test",
  className: "TestAgent",
  objectKey: "parent",
  executionDigest: "a".repeat(64),
};
const entity = {
  id: owner.runtimeId,
  authoritySessionId: owner.authoritySessionId,
  kind: "do",
  status: "active",
  source: { repoPath: image.source, effectiveVersion: "current-version" },
  contextId: owner.contextId,
  className: image.className,
  key: image.objectKey,
  activeExecutionDigest: image.executionDigest,
  agentBinding: {
    entityId: owner.runtimeId,
    contextId: owner.contextId,
    channelId,
  },
  createdAt: 1,
  cleanupComplete: false,
};
const sessions: Harness[] = [];
const databases: Array<{ close(): void }> = [];
afterEach(async () => {
  const results = await Promise.allSettled(
    sessions.splice(0).map((h) => h.close(context)),
  );
  for (const db of databases.splice(0)) db.close();
  for (const result of results)
    if (result.status === "rejected") throw result.reason;
});
class SpawnVessel extends AgentVesselBase {
  // This harness models delivery by the trusted host mailbox driver.
  protected override get rpcCallerId(): string {
    return "server";
  }
  protected override get rpcCallerKind(): string {
    return "server";
  }
  testHarness: Harness | null = null;
  activeEntity: JsonRepresentation<typeof entity> = detached(entity);
  readonly events = new Map<string, ChannelEvent[]>();
  readonly calls: Array<{
    target: string;
    method: string;
    args: JsonValue[];
    options?: RpcCallOptions;
  }> = [];
  readonly publicationCalls: Array<{
    channelId: string;
    event: ReturnType<typeof agenticEventSchema.parse>;
    key?: string;
  }> = [];
  readonly created = new Map<
    string,
    {
      id: string;
      contextId: string;
      config: JsonRepresentation<Record<string, unknown>>;
    }
  >();
  readonly activeChildren = new Set<string>();
  readonly admittedContexts = new Set<string>();
  failPublication:
    | ((event: AgenticEvent, key?: string) => Error | null)
    | null = null;
  losePublicationReply:
    | ((event: AgenticEvent, key?: string) => Error | null)
    | null = null;
  failCreateResponse = false;
  failDestroy: Error | null = null;
  changedContext = false;
  changedSettings = false;
  private rpcWireIntercepted = false;
  protected override getParticipantInfo(): ParticipantDescriptor {
    return { type: "agent", name: "parent", handle: "parent" };
  }
  protected override getMaxSubagents() {
    return 2;
  }
  protected override getMaxSubagentDepth() {
    return 2;
  }
  protected override existingAgentSession(): Harness | null {
    return this.testHarness;
  }
  protected override admittedAgentSession(): Harness {
    if (!this.testHarness) throw new Error("No admitted native owner");
    return this.testHarness;
  }
  protected override async agentSession(): Promise<Harness> {
    return this.admittedAgentSession();
  }
  protected override async nativeChannelConversation(
    id: string,
  ): Promise<Conversation> {
    const result = await this.admittedNativeChannelConversation(id);
    if (!result) throw new Error("No retained channel");
    return result;
  }
  protected override async refreshNativeChannelConfiguration(): Promise<void> {}
  protected override bindNativeToolExecution(
    api: ToolExecutionApi,
    ctx: Context,
  ): Promise<NativeInvocationExecution> {
    // Real native source/authentication boundary. Only external host and channel
    // transports are substituted; no invocation or Task identity is fabricated.
    return bindNativeToolInvocation(
      {
        harness: this.admittedAgentSession(),
        image: this.loadedImage(),
        rpc: this.rpc,
        enqueueStart: (tx, publication) =>
          this.enqueueNativeInvocationStart(tx, publication),
      },
      api,
      ctx,
    );
  }
  protected override get rpc(): RpcClient {
    const base = super.rpc;
    if (!this.rpcWireIntercepted) {
      this.rpcWireIntercepted = true;
      const wire = wireClientFor(base);
      wire.call = async (
        destination: string,
        method: string,
        args: unknown[],
        options?: RpcCallOptions,
      ): Promise<unknown> => {
        this.calls.push({
          target: destination,
          method,
          args: detached(args),
          options,
        });
        if (
          destination === "main" &&
          method === "workspace-state.entity.resolveActive"
        )
          return copyJson(this.activeEntity);
        if (destination === "main" && method === "runtime.resolveContext")
          return owner.contextId;
        if (
          destination === "main" &&
          method === "runtime.createSubagentContext"
        ) {
          const input = args[0] as {
            parentContextId: string;
            ownerEntityId: string;
            targetKey: string;
          };
          expect(input.parentContextId).toBe(owner.contextId);
          expect(input.ownerEntityId).toBe(owner.runtimeId);
          const contextId = contextIdForTargetKey(input.targetKey);
          this.admittedContexts.add(contextId);
          return {
            contextId: this.changedContext ? "foreign-context" : contextId,
          };
        }
        if (destination === "main" && method === "workers.resolveService") {
          expect(args[0]).toBe("vibestudio.channel.v1");
          const channel = String(args[1]);
          return durableObjectServiceFixture(
            `do:workers/pubsub-channel:PubSubChannel:${channel}`,
            {
              origin: "workspace",
              source: "workers/pubsub-channel",
              name: "pubsub-channel",
              action: "provide",
              presentation: { domain: "web", verb: "see" },
              authority: { principals: ["code"] },
              protocols: ["vibestudio.channel.v1"],
              className: "PubSubChannel",
              objectKey: channel,
            },
          );
        }
        if (destination === "main" && method === "runtime.createEntity") {
          const input = args[0] as {
            key: string;
            contextId: string;
            stateArgs: { agentConfig: Record<string, unknown> };
          };
          const child = {
            id: `do:workers/test:TestAgent:${input.key}`,
            contextId: input.contextId,
            config: detached(input.stateArgs.agentConfig),
          };
          this.created.set(input.key, child);
          if (this.failCreateResponse)
            throw new Error("Original accepted entity response lost");
          return {
            id: child.id,
            kind: "do",
            source: {
              repoPath: image.source,
              effectiveVersion: "current-version",
            },
            contextId: child.contextId,
            targetId: child.id,
          };
        }
        if (destination === "main" && method === "runtime.destroyContext") {
          if (this.failDestroy) throw this.failDestroy;
          const input = args[0] as { contextId: string };
          this.admittedContexts.delete(input.contextId);
          return undefined;
        }
        const child = [...this.created.values()].find(
          (child) => child.id === destination,
        );
        if (child && method === "subscribeChannel")
          return { ok: true, participantId: child.id };
        if (child && method === "importChannelKnowledge")
          return { ok: true, participantId: child.id };
        if (child && method === "getAgentSettings")
          return {
            ...child.config,
            ...(this.changedSettings ? { thinkingLevel: "changed" } : {}),
          };
        if (child && method === "readSubagentExecutionActivity")
          return { active: this.activeChildren.has(child.id) };
        if (child && method === "cancelSubagentExecution") {
          const input = args[0] as {
            runId: string;
            taskChannelId: string;
            operationId: string;
          };
          const run = this.runs().find((run) => run.childEntityId === child.id);
          expect(input.runId).toBe(run?.runId);
          expect(input.taskChannelId).toBe(run?.taskChannelId);
          expect(input.operationId).toBe(options?.causalParent?.invocationId);
          this.activeChildren.delete(child.id);
          return { cancelled: true };
        }
        throw new Error(
          `Unexpected protected host operation ${destination}.${method}`,
        );
      };
    }
    return base;
  }
  protected override createChannelClient(id: string): ChannelClient {
    const list = () => this.events.get(id) ?? [];
    const replay = async (request: { after: number; throughSeq?: number }) => {
      const through =
        request.throughSeq ?? Math.max(0, ...list().map((e) => e.id));
      return {
        mode: "after",
        logEvents: list().filter(
          (e) => e.id > request.after && e.id <= through,
        ),
        snapshots: [],
        ready: {
          totalCount: list().length,
          envelopeCount: list().length,
          snapshotLastSeq: through,
          hasMoreAfter: false,
        },
      };
    };
    return {
      join: async (input: { participantId: string; operationId: string }) => ({
        ok: true,
        participantId: input.participantId,
        revision: 1,
        channelConfig: {},
        envelope: { logEvents: [], ready: { totalCount: 0, envelopeCount: 0 } },
      }),
      leave: async () => {},
      getConfig: async () => ({}),
      getEnvelope: async (messageId: string) =>
        list().find((event) => event.messageId === messageId) ?? null,
      resolveTarget: async () =>
        `do:workers/pubsub-channel:PubSubChannel:${id}`,
      getReplayAfter: replay,
      replayAfterPages: async function* (request: {
        after: number;
        throughSeq?: number;
      }) {
        yield await replay(request);
      },
      recordTaskProvenance: async (input: unknown) => {
        this.calls.push({
          target: id,
          method: "recordTaskProvenance",
          args: [copyJson(input)],
        });
      },
      publishAgenticEvent: async (
        pid: string,
        event: AgenticEvent,
        options?: { idempotencyKey?: string },
      ) => {
        const key = options?.idempotencyKey;
        this.publicationCalls.push({
          channelId: id,
          event: agenticEventSchema.parse(copyJson(event)),
          key,
        });
        const error = this.failPublication?.(event, key);
        if (error) throw error;
        const existing = key
          ? list().find((e) => e.messageId === `ik:${key}`)
          : undefined;
        if (existing) {
          expect(existing.payload).toEqual(event);
          return { id: existing.id };
        }
        const sequence = Math.max(0, ...list().map((e) => e.id)) + 1;
        const envelope: ChannelEvent = {
          id: sequence,
          messageId: key ? `ik:${key}` : `event:${sequence}`,
          type: AGENTIC_EVENT_PAYLOAD_KIND,
          payload: copyJson(event),
          senderId: pid,
          ts: sequence,
        };
        this.events.set(id, [...list(), envelope]);
        const lostReply = this.losePublicationReply?.(event, key);
        if (lostReply) throw lostReply;
        return { id: sequence };
      },
    } as unknown as ChannelClient;
  }
  createPublication(
    id: string,
    participant: string,
    event: AgenticEvent,
    key: string,
  ) {
    return this.createChannelClient(id).publishAgenticEvent(
      participant,
      event,
      { idempotencyKey: key },
    );
  }
  deliveryFromSource(
    sourceChannelId: string,
    event: ChannelEvent,
  ): Parameters<SpawnVessel["acceptChannelDelivery"]>[0] {
    const subscription = this.subscriptions
      .listStored()
      .find((row) => row.channelId === sourceChannelId);
    if (!subscription) throw new Error("No actual source membership");
    const events = this.events.get(sourceChannelId) ?? [];
    if (!events.some((original) => original.messageId === event.messageId))
      this.events.set(sourceChannelId, [...events, event]);
    return {
      deliveryId: "delivery:" + sourceChannelId + ":" + event.messageId,
      channelId: sourceChannelId,
      channelRef: {
        source: "workers/pubsub-channel",
        className: "PubSubChannel",
        objectKey: sourceChannelId,
      },
      participantId: subscription.participantId,
      subscriptionRevision: subscription.revision,
      eventSequence: event.id,
      envelope: { kind: "log", event },
      agenticContext: {
        version: 1,
        relationships: [
          {
            participantId: subscription.participantId,
            metadata: { type: "agent", name: "Parent" },
            applicationConfig: null,
          },
        ],
        channelConfig: {},
        conversation: {
          lastCompletedSender: null,
          lastCompletedMessageId: null,
          lastCompletedSeq: null,
          previousCompletedSender: null,
          previousCompletedMessageId: null,
          previousCompletedSeq: null,
          agentStreak: 0,
        },
        replyToSenderId: null,
      },
    };
  }
  async membership(config: unknown = {}) {
    this.ensureIdentity();
    await this.subscriptions.subscribe({
      channelId,
      channelRef: {
        source: "workers/pubsub-channel",
        className: "PubSubChannel",
        objectKey: channelId,
      },
      contextId: owner.contextId,
      descriptor: this.getParticipantInfo(),
      config,
      replay: false,
    });
  }
  offer() {
    return this.nativeChildLaunchOffer(channelId);
  }
  activity(channel: string) {
    return this.subagentExecutionActive(channel);
  }
  execute(...args: Parameters<SpawnVessel["executeNativeSpawn"]>) {
    return this.executeNativeSpawn(...args);
  }
  cancel(...args: Parameters<SpawnVessel["cancelNativeSpawn"]>) {
    return this.cancelNativeSpawn(...args);
  }
  async executeCancellation(
    args: { runId: string; reason: string },
    api: ToolExecutionApi,
    ctx: Context,
    admit = true,
  ) {
    const execution = await this.bindNativeToolExecution(api, ctx);
    return this.cancelSubagent(
      args.runId,
      args.reason,
      api,
      ctx,
      channelId,
      execution.rpc,
      admit,
    );
  }
  setDomainTerminal(runId: string, sourceEventId: string) {
    this.subagentRuns.setSourceEventId(runId, sourceEventId);
    this.subagentRuns.setStatus(runId, "failed");
  }
  runs() {
    return this.subagentRuns.listAll();
  }
}
async function fixture(
  options: {
    config?: unknown;
    stateArgs?: Record<string, unknown>;
    tools?: ToolRegistration[];
  } = {},
) {
  const result = await createNativeVesselTestDO(
    SpawnVessel,
    {
      __objectKey: "parent",
      WORKER_SOURCE: image.source,
      WORKER_CLASS_NAME: image.className,
      WORKER_EXECUTION_DIGEST: image.executionDigest,
    },
    { props: { stateArgs: options.stateArgs ?? null, image: null } },
  );
  databases.push(result.db);
  const vessel = result.instance;
  await vessel.membership(options.config);
  const models = createModels(),
    faux = fauxProvider();
  models.setProvider(faux.provider);
  const registry = createRegistry();
  const publication = createNativeChannelPublication({
    publish: async (id, participant, event, key) =>
      vessel.createPublication(id, participant, event, key),
  });
  registry.install(
    defineExtension({ name: "native-publication", tasks: [publication.task] }),
  );
  const tool = defineTool({
    name: "spawn_subagent",
    description: "Actual shipping child launch",
    parameters: Type.Object({
      mode: Type.Union([Type.Literal("fresh"), Type.Literal("fork")]),
      task: Type.String(),
      label: Type.Optional(Type.String()),
      config: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    }),
    executionData: vessel.offer(),
    execute: (args, api, ctx) => vessel.execute(args, api, ctx),
    cancel: (args, api, ctx) => vessel.cancel(args, api, ctx),
  });
  const cancellation = defineTool({
    name: "cancel_subagent",
    description: "Actual retained collaborator cancellation",
    parameters: Type.Object({ runId: Type.String(), reason: Type.String() }),
    execute: (args, api, ctx) => vessel.executeCancellation(args, api, ctx),
    cancel: (args, api, ctx) =>
      vessel.executeCancellation(args, api, ctx, false),
  });
  registry.install(
    defineExtension({
      name: "shipping-spawn",
      tools: [tool, cancellation, ...(options.tools ?? [])],
    }),
  );
  const harness = await openPlatformAgentSession(
    async () => new MemoryStorage(),
    image,
    createMainRpcCaller(
      schemaRpcMock({
        call: async (_target, method) =>
          method === "workspace-state.alarmSourceRegister"
            ? { entity: vessel.activeEntity, incarnation: owner.incarnation }
            : "accepted",
      }),
    ),
    {
      models,
      registry,
      prepareCommit: publication.prepareCommit,
      settings: { followUpMode: "one-at-a-time" },
    },
    context,
  );
  sessions.push(harness);
  vessel.testHarness = harness;
  const conversation = await openNativeChannelConversation(
    harness,
    {
      channelId,
      channelRef: {
        source: "workers/pubsub-channel",
        className: "PubSubChannel",
        objectKey: channelId,
      },
      contextId: owner.contextId,
    },
    {
      model: { provider: "faux", modelId: "faux-1" },
      tools: [tool, cancellation, ...(options.tools ?? [])],
    },
    context,
    (tx, id) =>
      publication.bind(tx, id, {
        channelId,
        participantId: owner.runtimeId,
        actor: {
          kind: "agent",
          id: owner.runtimeId,
          participantId: owner.runtimeId,
        },
        policy: "all",
      }),
  );
  async function spawn(
    args: JsonObject = { mode: "fresh", task: "Original narrow assignment" },
    id = "spawn-call",
  ) {
    return conversation.invokeTool(
      { id, name: tool.name, arguments: args },
      context,
    );
  }
  async function terminal(id: TaskId) {
    return harness.waitForTask(id, context);
  }
  async function retry(id: TaskId) {
    const task = await harness.getTask(id, context);
    if (
      task?.state.status !== "waiting" ||
      task.state.condition.kind !== "failure"
    )
      throw new Error("No owned native child launch failure");
    await harness.retryTask(id, task.state.condition.incident, context);
    return terminal(id);
  }
  function cancelRun(
    runId: string,
    id: string,
    reason = "Explicit original cancellation",
  ) {
    return conversation.invokeTool(
      { id, name: cancellation.name, arguments: { runId, reason } },
      context,
    );
  }
  return {
    vessel,
    harness,
    conversation,
    tool,
    spawn,
    cancelRun,
    terminal,
    retry,
    faux,
  };
}

describe("native shipping subagent launch", () => {
  it("inherits original offered agent behavior and channel system prompt under exact actual source authority", async () => {
    const f = await fixture({
      config: {
        systemPrompt: "Original channel instruction",
        systemPromptMode: "append",
      },
      stateArgs: {
        agentConfig: {
          model: "openai-codex:gpt-6.1-sol",
          thinkingLevel: "low",
          fastMode: true,
          approvalLevel: 1,
          fallbackOn: ["usage_limit_terminal"],
          fallbackScope: "all-turns",
        },
      },
    });
    const id = await f.spawn();
    await f.terminal(id);
    const created = [...f.vessel.created.values()][0]!;
    expect(created.config).toMatchObject({
      model: "openai-codex:gpt-6.1-sol",
      thinkingLevel: "low",
      fastMode: true,
      approvalLevel: 1,
      systemPrompt: "Original channel instruction",
      systemPromptMode: "append",
      fallbackOn: ["usage_limit_terminal"],
      fallbackScope: "all-turns",
    });
    const source = f.vessel.publicationCalls.find(
      (p) => p.event.kind === "invocation.started",
    )!;
    expect(source.event).toMatchObject({
      payload: {
        nativeSource: {
          task: { taskId: id, conversationId: f.conversation.id },
          operation: { kind: "direct-tool", callId: "spawn-call" },
        },
      },
    });
    const provisioning = f.vessel.calls.filter((c) =>
      [
        "runtime.createSubagentContext",
        "runtime.createEntity",
        "subscribeChannel",
      ].includes(c.method),
    );
    expect(provisioning.length).toBe(3);
    for (const call of provisioning)
      expect(call.options?.causalParent?.invocationId).toBe(
        source.event.causality?.invocationId,
      );
    expect(f.vessel.runs()[0]).toMatchObject({
      status: "running",
      nativeTaskId: id,
      parentContextId: owner.contextId,
      childContextId: created.contextId,
      childParticipantId: created.id,
    });
    expect(f.faux.state.callCount).toBe(0);
  });
  it("applies explicit child configuration to the original offered settings", async () => {
    const f = await fixture({
      stateArgs: {
        agentConfig: {
          model: "openai-codex:gpt-6.1-sol",
          approvalLevel: 1,
          thinkingLevel: "low",
        },
      },
    });
    await f.terminal(
      await f.spawn({
        mode: "fresh",
        task: "Explicit scoped work",
        config: {
          approvalLevel: 0,
          thinkingLevel: "high",
          systemPrompt: "Child-only instruction",
        },
      }),
    );
    expect([...f.vessel.created.values()][0]!.config).toMatchObject({
      approvalLevel: 0,
      thinkingLevel: "high",
      systemPrompt: "Child-only instruction",
    });
  });
  it("refuses an unavailable child model before any context/entity or retained resource row exists", async () => {
    const f = await fixture();
    await expect(
      f.terminal(
        await f.spawn({
          mode: "fresh",
          task: "Task",
          config: { model: "missing-provider:missing" },
        }),
      ),
    ).resolves.toMatchObject({
      state: {
        status: "terminal",
        outcome: {
          status: "failed",
          error: { message: expect.stringContaining("cannot be materialized") },
        },
      },
    });
    expect(f.vessel.admittedContexts.size).toBe(0);
    expect(f.vessel.created.size).toBe(0);
    expect(f.vessel.runs()).toEqual([]);
  });
  it("refuses an authoritatively retired execution owner before publishing authority or creating child resources", async () => {
    const f = await fixture();
    await retireBoundAgentSession(f.harness, context);
    await expect(f.terminal(await f.spawn())).resolves.toMatchObject({
      state: {
        status: "terminal",
        outcome: {
          status: "failed",
          error: {
            message: expect.stringContaining("existing host-bound owner"),
          },
        },
      },
    });
    expect(f.vessel.created.size).toBe(0);
    expect(f.vessel.admittedContexts.size).toBe(0);
    expect(f.vessel.publicationCalls).toEqual([]);
  });
  it("refuses actual excessive parent depth before creating child lifecycle state", async () => {
    const f = await fixture({
      stateArgs: {
        subagent: {
          runId: "parent-run",
          task: "parent-task",
          parentRef: "grandparent",
          parentChannelId: "grandparent-channel",
          taskChannelId: channelId,
          parentContextId: "grandparent-context",
          parentParticipantId: "grandparent",
          depth: 2,
        },
      },
    });
    await expect(f.terminal(await f.spawn())).resolves.toMatchObject({
      state: {
        status: "terminal",
        outcome: {
          status: "failed",
          error: { message: expect.stringContaining("depth limit reached") },
        },
      },
    });
    expect(f.vessel.created.size).toBe(0);
  });
  it("retains accepted resource identity and original offered configuration after lost entity acknowledgement", async () => {
    const f = await fixture();
    f.vessel.failCreateResponse = true;
    const id = await f.spawn();
    await expect(f.terminal(id)).rejects.toThrow(
      "Original accepted entity response lost",
    );
    const original = [...f.vessel.created.entries()][0]!;
    await f.vessel.configureAgent({
      model: "openai-codex:gpt-6-luna",
      approvalLevel: 0,
    });
    f.vessel.failCreateResponse = false;
    await f.retry(id);
    expect([...f.vessel.created.entries()]).toEqual([original]);
    const calls = f.vessel.calls.filter(
      (c) => c.method === "runtime.createEntity",
    );
    expect(calls).toHaveLength(2);
    expect(calls[1]!.args).toEqual(calls[0]!.args);
    expect(
      f.vessel.publicationCalls.filter(
        (p) => p.event.kind === "invocation.started",
      ),
    ).toHaveLength(1);
  });
  it("retains failed started-card publication and resumes the same owned resource before seed", async () => {
    const f = await fixture();
    const original = new Error("Original started card publish lost");
    f.vessel.failPublication = (event) =>
      event.kind === "task.started" ? original : null;
    const id = await f.spawn();
    await expect(f.terminal(id)).rejects.toThrow(original.message);
    expect(f.vessel.runs()[0]?.status).toBe("starting");
    expect(
      f.vessel.publicationCalls.some((p) =>
        p.key?.startsWith("subagent-seed:"),
      ),
    ).toBe(false);
    const created = [...f.vessel.created.entries()];
    f.vessel.failPublication = null;
    await f.retry(id);
    expect([...f.vessel.created.entries()]).toEqual(created);
    expect(f.vessel.runs()[0]?.status).toBe("running");
    expect(
      f.vessel.publicationCalls.filter((p) =>
        p.key?.startsWith("subagent-started:"),
      ),
    ).toHaveLength(2);
  });
  it("replays identical started-card bytes after canonical acceptance but lost acknowledgement", async () => {
    const f = await fixture();
    let accepted = false;
    f.vessel.losePublicationReply = (event) => {
      if (event.kind !== "task.started" || accepted) return null;
      accepted = true;
      return new Error("Canonical started card accepted; original reply lost");
    };
    const id = await f.spawn();
    await expect(f.terminal(id)).rejects.toThrow("original reply lost");
    expect(f.vessel.runs()[0]?.status).toBe("starting");
    // Shift wall clock without a production timer; replay must use durable facts.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 10_000);
    try {
      await f.retry(id);
    } finally {
      vi.useRealTimers();
    }
    expect(f.vessel.runs()[0]?.status).toBe("running");
    const started = f.vessel.publicationCalls.filter(
      (call) => call.event.kind === "task.started",
    );
    expect(started).toHaveLength(2);
    expect(started[1]).toEqual(started[0]);
    expect(
      (f.vessel.events.get(channelId) ?? []).filter(
        (event) => (event.payload as AgenticEvent).kind === "task.started",
      ),
    ).toHaveLength(1);
  });

  it("retries a lost task seed with the identical durable event without recreating the child", async () => {
    const f = await fixture();
    f.vessel.failPublication = (_event, key) =>
      key?.startsWith("subagent-seed:")
        ? new Error("Original seed publication lost")
        : null;
    const id = await f.spawn();
    await expect(f.terminal(id)).rejects.toThrow(
      "Original seed publication lost",
    );
    expect(f.vessel.runs()[0]?.status).toBe("running");
    const entities = f.vessel.calls.filter(
      (c) => c.method === "runtime.createEntity",
    ).length;
    f.vessel.failPublication = null;
    await f.retry(id);
    const seeds = f.vessel.publicationCalls.filter((p) =>
      p.key?.startsWith("subagent-seed:"),
    );
    expect(seeds).toHaveLength(2);
    expect(seeds[1]).toEqual(seeds[0]);
    expect(
      f.vessel.calls.filter((c) => c.method === "runtime.createEntity"),
    ).toHaveLength(entities);
    const event = seeds[0]!.event;
    expect(event).toMatchObject({
      kind: "message.completed",
      payload: {
        to: [
          {
            kind: "participant",
            participantId: f.vessel.runs()[0]!.childParticipantId,
          },
        ],
      },
    });
  });
  it("opens a cold native owner before inspecting retained collaborator activity without admitting a turn", async () => {
    const f = await fixture();
    const before = await f.harness.inspect(context);
    f.vessel.testHarness = null;
    const admission = vi
      .spyOn(
        f.vessel as unknown as { restoreAgentSession(): Promise<Harness> },
        "restoreAgentSession",
      )
      .mockImplementation(async () => {
        f.vessel.testHarness = f.harness;
        return f.harness;
      });
    try {
      expect(await f.vessel.activity(channelId)).toBe(false);
      expect(admission).toHaveBeenCalledOnce();
      const after = await f.harness.inspect(context);
      expect(after.tasks).toEqual(before.tasks);
      expect(after.submissions).toEqual(before.submissions);
    } finally {
      admission.mockRestore();
    }
  });
  it("propagates cold collaborator owner admission failure rather than reporting idle", async () => {
    const f = await fixture();
    f.vessel.testHarness = null;
    const original = new Error(
      "The retained owner no longer matches its platform incarnation",
    );
    const admission = vi
      .spyOn(
        f.vessel as unknown as { restoreAgentSession(): Promise<Harness> },
        "restoreAgentSession",
      )
      .mockRejectedValue(original);
    try {
      await expect(f.vessel.activity(channelId)).rejects.toBe(original);
    } finally {
      f.vessel.testHarness = f.harness;
      admission.mockRestore();
    }
  });
  it("counts current child activity rather than retained run status against fan-out", async () => {
    const f = await fixture();
    await f.terminal(await f.spawn(undefined, "first"));
    await f.terminal(await f.spawn(undefined, "second"));
    for (const child of f.vessel.created.values())
      f.vessel.activeChildren.add(child.id);
    await expect(
      f.terminal(await f.spawn(undefined, "blocked")),
    ).resolves.toMatchObject({
      state: {
        status: "terminal",
        outcome: {
          status: "failed",
          error: {
            message: expect.stringContaining("execution limit reached"),
          },
        },
      },
    });
    expect(f.vessel.created.size).toBe(2);
    f.vessel.activeChildren.delete([...f.vessel.created.values()][0]!.id);
    await f.terminal(await f.spawn(undefined, "replacement"));
    expect(f.vessel.created.size).toBe(3);
  });
  it("cancels a new actual assignment on a retained cancelled collaborator with its own exact operation fact", async () => {
    const f = await fixture();
    await f.terminal(await f.spawn());
    const run = f.vessel.runs()[0]!;
    f.vessel.activeChildren.add(run.childEntityId);
    await f.terminal(await f.cancelRun(run.runId, "cancel-first"));
    expect(f.vessel.runs()[0]?.status).toBe("cancelled");
    expect(f.vessel.activeChildren.has(run.childEntityId)).toBe(false);
    const retainedResources = [...f.vessel.created.entries()];
    // The same collaborator receives another authoritative assignment. Domain
    // history still says cancelled; current execution is established by its port.
    f.vessel.activeChildren.add(run.childEntityId);
    await f.terminal(
      await f.cancelRun(run.runId, "cancel-second", "Cancel second assignment"),
    );
    const cancellations = f.vessel.calls.filter(
      (call) => call.method === "cancelSubagentExecution",
    );
    expect(cancellations).toHaveLength(2);
    expect(cancellations[1]!.args[0]).not.toEqual(cancellations[0]!.args[0]);
    expect(f.vessel.activeChildren.has(run.childEntityId)).toBe(false);
    expect([...f.vessel.created.entries()]).toEqual(retainedResources);
    expect(f.vessel.admittedContexts.has(run.childContextId)).toBe(true);
    const terminal = (f.vessel.events.get(channelId) ?? []).filter(
      (event) => (event.payload as AgenticEvent).kind === "task.cancelled",
    );
    expect(terminal).toHaveLength(2);
    expect(terminal[1]!.messageId).not.toBe(terminal[0]!.messageId);
  });

  it("retains original terminal publication bytes across failure and later domain source/status mutation", async () => {
    const f = await fixture();
    await f.terminal(await f.spawn());
    const run = f.vessel.runs()[0]!;
    f.vessel.activeChildren.add(run.childEntityId);
    f.vessel.failPublication = (event) =>
      event.kind === "task.cancelled"
        ? new Error("Original terminal dispatch failed")
        : null;
    const task = await f.cancelRun(run.runId, "cancel-original");
    await expect(f.terminal(task)).rejects.toThrow(
      "Original terminal dispatch failed",
    );
    f.vessel.setDomainTerminal(run.runId, "unrelated-later-source");
    f.vessel.failPublication = null;
    await f.retry(task);
    const attempts = f.vessel.publicationCalls.filter(
      (call) => call.event.kind === "task.cancelled",
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(JSON.stringify(attempts[1]!.event)).not.toContain(
      "unrelated-later-source",
    );
    expect(f.vessel.runs()[0]?.status).toBe("cancelled");
  });

  it("rereads the first accepted parent terminal after lost acknowledgement without republishing a changed fact", async () => {
    const f = await fixture();
    await f.terminal(await f.spawn());
    const run = f.vessel.runs()[0]!;
    f.vessel.activeChildren.add(run.childEntityId);
    let lost = false;
    f.vessel.losePublicationReply = (event) => {
      if (event.kind !== "task.cancelled" || lost) return null;
      lost = true;
      return new Error("Canonical terminal accepted; original reply lost");
    };
    const task = await f.cancelRun(run.runId, "cancel-first-winner");
    await expect(f.terminal(task)).rejects.toThrow("original reply lost");
    const winner = copyJson(
      (f.vessel.events.get(channelId) ?? []).find(
        (event) => (event.payload as AgenticEvent).kind === "task.cancelled",
      )!,
    );
    f.vessel.setDomainTerminal(run.runId, "later-source-cannot-replace-winner");
    await f.retry(task);
    expect(f.vessel.runs()[0]?.status).toBe("cancelled");
    expect(
      f.vessel.publicationCalls.filter(
        (call) => call.event.kind === "task.cancelled",
      ),
    ).toHaveLength(1);
    expect(
      (f.vessel.events.get(channelId) ?? []).filter(
        (event) => (event.payload as AgenticEvent).kind === "task.cancelled",
      ),
    ).toEqual([winner]);
    const calls = f.vessel.calls.filter(
      (call) => call.method === "cancelSubagentExecution",
    );
    expect(calls).toHaveLength(2);
    expect(calls[1]!.args).toEqual(calls[0]!.args);
  });

  it("rejects changed original resource scope while retaining one detached supervisor fact", async () => {
    const f = await fixture();
    await f.terminal(await f.spawn());
    const run = f.vessel.runs()[0]!;
    const scope = {
      operationId: "actual-resource-settlement",
      runId: run.runId,
      parentChannelId: run.parentChannelId,
      parentContextId: run.parentContextId!,
      childEntityId: run.childEntityId,
      childContextId: run.childContextId,
      taskChannelId: run.taskChannelId,
      senderId: owner.runtimeId,
    };
    const original = {
      kind: "task.cancelled",
      actor: { kind: "agent", id: owner.runtimeId },
      causality: { taskId: run.runId, invocationId: run.runId },
      createdAt: "2026-01-01T00:00:00.000Z",
      payload: {
        protocol: AGENTIC_PROTOCOL_VERSION,
        reason: "Original explicit cancellation",
        terminalOutcome: "cancelled",
      },
    } as AgenticEvent;
    const stored = await retainNativeSubagentTerminal(
      f.conversation,
      f.conversation.id,
      scope,
      () => original,
      context,
    );
    const createReplacement = vi.fn(() => ({
      ...original,
      createdAt: "2030-01-01T00:00:00.000Z",
    }));
    expect(
      await retainNativeSubagentTerminal(
        f.conversation,
        f.conversation.id,
        scope,
        createReplacement,
        context,
      ),
    ).toEqual(stored);
    expect(createReplacement).not.toHaveBeenCalled();
    await expect(
      retainNativeSubagentTerminal(
        f.conversation,
        f.conversation.id,
        { ...scope, childContextId: "foreign-replacement-context" },
        createReplacement,
        context,
      ),
    ).rejects.toThrow("changed its original resources");
    await expect(
      retainNativeSubagentTerminal(
        f.conversation,
        f.conversation.id,
        { ...scope, senderId: "foreign-supervisor" },
        createReplacement,
        context,
      ),
    ).rejects.toThrow("changed its original resources");
    expect(
      await retainNativeSubagentTerminal(
        f.conversation,
        f.conversation.id,
        scope,
        createReplacement,
        context,
      ),
    ).toEqual(stored);
    expect(createReplacement).not.toHaveBeenCalled();
  });

  it("admits an explicit child report as canonical follow-up while preserving the original waiting parent request", async () => {
    let entered!: () => void;
    const owned = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const hold = defineTool({
      name: "parent_owned_work",
      description: "Actual still-owned parent operation",
      replay: "safe",
      parameters: Type.Object({}),
      execute: async (_args, api, ctx) => {
        if (api.continuation !== undefined)
          return {
            content: [
              { type: "text" as const, text: "Original parent work joined" },
            ],
          };
        await api.commit(
          (tx) => bindReceipt(tx, "actual-parent-work", "original"),
          ctx,
        );
        entered();
        return {
          wait: {
            kind: "receipt" as const,
            key: "actual-parent-work",
            binding: "original",
          },
          continuation: { original: true },
        };
      },
      cancel: async () => ({ content: [] }),
    });
    const f = await fixture({ tools: [hold] });
    await f.terminal(await f.spawn());
    const run = f.vessel.runs()[0]!;
    f.faux.setResponses([
      fauxAssistantMessage(
        [
          {
            type: "toolCall",
            id: "original-owned-call",
            name: hold.name,
            arguments: {},
          },
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("Original request continues with child report"),
      fauxAssistantMessage("Follow-up report acknowledged"),
    ]);
    const original = await f.conversation.submit(
      {
        type: "input",
        requestId: "original-parent-request",
        content: "Original user request remains the task",
      },
      context,
    );
    await owned;
    const event: ChannelEvent = {
      id: 10,
      messageId: "canonical-child-report",
      type: AGENTIC_EVENT_PAYLOAD_KIND,
      senderId: run.childParticipantId!,
      ts: 10,
      payload: agenticEventSchema.parse({
        kind: "message.completed",
        actor: { kind: "agent", id: run.childParticipantId },
        causality: { messageId: "original-child-report-message" },
        payload: {
          protocol: AGENTIC_PROTOCOL_VERSION,
          role: "assistant",
          outcome: "completed",
          to: [{ kind: "participant", participantId: owner.runtimeId }],
          blocks: [
            {
              type: "text",
              content:
                "Child report: a problem to consider, not a terminal failure",
            },
          ],
        },
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    };
    const delivery = f.vessel.deliveryFromSource(run.taskChannelId, event);
    await expect(
      f.vessel.acceptChannelDelivery(delivery),
    ).resolves.toMatchObject({ disposition: "processed" });
    await expect(
      f.vessel.acceptChannelDelivery(delivery),
    ).resolves.toMatchObject({ disposition: "duplicate" });
    const pending = (await f.harness.inspect(context)).submissions;
    expect(pending.find((input) => input.id === original.id)?.status).toBe(
      "placed",
    );
    expect(
      pending.filter(
        (input) => input.id !== original.id && input.type === "input",
      ),
    ).toHaveLength(1);
    expect(
      pending.find(
        (input) => input.id !== original.id && input.type === "input",
      )?.status,
    ).toBe("queued");
    expect(f.vessel.runs()[0]?.status).toBe("running");
    await f.harness.commit(
      (tx) =>
        acceptReceipt(tx, "actual-parent-work", "original", { joined: true }),
      context,
    );
    await original.wait(context);
    await f.conversation.waitForIdle(context);
    const users = [
      ...(await f.conversation.entries({}, 100, undefined, context)).items,
    ]
      .sort((a, b) => a.id - b.id)
      .flatMap(
        (entry) =>
          entry.model?.filter((message) => message.role === "user") ?? [],
      );
    expect(users).toHaveLength(2);
    expect(JSON.stringify(users[0])).toContain(
      "Original user request remains the task",
    );
    expect(JSON.stringify(users[1])).toContain(
      "sent a report for the existing user request",
    );
    expect(JSON.stringify(users[1])).toContain(
      "Child report: a problem to consider",
    );
    expect(f.vessel.runs()[0]?.status).toBe("running");
    expect(
      f.vessel.publicationCalls.some(
        (call) => call.event.kind === "task.failed",
      ),
    ).toBe(false);
  });

  it("authenticates child failure and supervisor cancellation against exact canonical source channels", async () => {
    const f = await fixture();
    await f.terminal(await f.spawn());
    const run = f.vessel.runs()[0]!;
    const event = (
      id: number,
      sender: string,
      actor: string,
      kind: "task.failed" | "task.cancelled",
    ): ChannelEvent => ({
      id,
      messageId: "canonical-task-event:" + id,
      type: AGENTIC_EVENT_PAYLOAD_KIND,
      senderId: sender,
      ts: id,
      payload: agenticEventSchema.parse({
        kind,
        actor: { kind: "agent", id: actor },
        causality: { taskId: run.runId, invocationId: run.runId },
        payload: {
          protocol: AGENTIC_PROTOCOL_VERSION,
          reason: "Actual canonical terminal " + id,
          terminalOutcome: kind === "task.failed" ? "tool_error" : "cancelled",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    });
    for (const rejected of [
      event(10, "foreign", run.childParticipantId!, "task.failed"),
      event(11, run.childParticipantId!, "foreign", "task.failed"),
      event(
        12,
        run.childParticipantId!,
        run.childParticipantId!,
        "task.cancelled",
      ),
    ]) {
      await f.vessel.acceptChannelDelivery(
        f.vessel.deliveryFromSource(run.taskChannelId, rejected),
      );
      expect(f.vessel.runs()[0]?.status).toBe("running");
    }
    expect(
      f.vessel.publicationCalls.filter(
        (call) =>
          call.event.kind === "task.failed" ||
          call.event.kind === "task.cancelled",
      ),
    ).toHaveLength(0);
    const childFailure = event(
      13,
      run.childParticipantId!,
      run.childParticipantId!,
      "task.failed",
    );
    await f.vessel.acceptChannelDelivery(
      f.vessel.deliveryFromSource(run.taskChannelId, childFailure),
    );
    await f.conversation.waitForIdle(context);
    expect(f.vessel.runs()[0]?.status).toBe("failed");
    expect(
      f.vessel.publicationCalls.filter(
        (call) => call.event.kind === "task.failed",
      ),
    ).toHaveLength(1);
    const parentCancellation = event(
      30,
      owner.runtimeId,
      owner.runtimeId,
      "task.cancelled",
    );
    await f.vessel.acceptChannelDelivery(
      f.vessel.deliveryFromSource(channelId, parentCancellation),
    );
    await f.conversation.waitForIdle(context);
    expect(f.vessel.runs()[0]?.status).toBe("cancelled");
  });

  it("retries the same canonical child failure mirror after lost acceptance and permits a later assignment failure", async () => {
    const f = await fixture();
    await f.terminal(await f.spawn());
    const run = f.vessel.runs()[0]!;
    const failure = (id: number): ChannelEvent => ({
      id,
      messageId: "actual-child-failure:" + id,
      type: AGENTIC_EVENT_PAYLOAD_KIND,
      senderId: run.childParticipantId!,
      ts: id,
      payload: agenticEventSchema.parse({
        kind: "task.failed",
        actor: { kind: "agent", id: run.childParticipantId },
        causality: { taskId: run.runId, invocationId: run.runId },
        payload: {
          protocol: AGENTIC_PROTOCOL_VERSION,
          reason: "Original child assignment failure " + id,
          terminalOutcome: "tool_error",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    });
    let accepted = false;
    f.vessel.losePublicationReply = (event) => {
      if (event.kind !== "task.failed" || accepted) return null;
      accepted = true;
      return new Error("Canonical child failure mirror accepted; reply lost");
    };
    const first = f.vessel.deliveryFromSource(run.taskChannelId, failure(10));
    await expect(f.vessel.acceptChannelDelivery(first)).rejects.toThrow(
      "reply lost",
    );
    expect(f.vessel.runs()[0]?.status).toBe("running");
    await f.vessel.acceptChannelDelivery(first);
    await f.conversation.waitForIdle(context);
    expect(f.vessel.runs()[0]?.status).toBe("failed");
    f.vessel.activeChildren.add(run.childEntityId);
    await f.vessel.acceptChannelDelivery(
      f.vessel.deliveryFromSource(run.taskChannelId, failure(20)),
    );
    await f.conversation.waitForIdle(context);
    const attempts = f.vessel.publicationCalls.filter(
      (call) => call.event.kind === "task.failed",
    );
    expect(attempts).toHaveLength(3);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[2]!.key).not.toBe(attempts[0]!.key);
    expect(
      (f.vessel.events.get(channelId) ?? []).filter(
        (event) => (event.payload as AgenticEvent).kind === "task.failed",
      ),
    ).toHaveLength(2);
  });

  it("exports genuine original native input knowledge before child import, membership and task seed", async () => {
    const f = await fixture();
    const event: ChannelEvent = {
      id: 1,
      messageId: "parent-envelope",
      type: AGENTIC_EVENT_PAYLOAD_KIND,
      senderId: "user:original",
      ts: 1,
      payload: {
        kind: "message.completed",
        actor: { kind: "user", id: "user:original" },
        causality: { messageId: "parent-input" },
        payload: {
          protocol: AGENTIC_PROTOCOL_VERSION,
          role: "user",
          outcome: "completed",
          blocks: [{ type: "text", content: "Original parent knowledge" }],
        },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    };
    f.vessel.events.set(channelId, [event]);
    f.faux.setResponses([
      fauxAssistantMessage("Original native parent answer"),
    ]);
    const admitted = await submitNativeChannelDelivery(
      f.harness,
      {
        channelId,
        channelRef: {
          source: "workers/pubsub-channel",
          className: "PubSubChannel",
          objectKey: channelId,
        },
        contextId: owner.contextId,
      },
      {
        deliveryId: "parent-input-delivery",
        channelId,
        channelRef: {
          source: "workers/pubsub-channel",
          className: "PubSubChannel",
          objectKey: channelId,
        },
        participantId: owner.runtimeId,
        subscriptionRevision: 1,
        eventSequence: 1,
        envelope: { kind: "log", event },
        agenticContext: {
          version: 1,
          relationships: [
            {
              participantId: owner.runtimeId,
              metadata: { name: "Parent", type: "agent" },
              applicationConfig: null,
            },
          ],
          channelConfig: {},
          conversation: {
            lastCompletedSender: null,
            lastCompletedMessageId: null,
            lastCompletedSeq: null,
            previousCompletedSender: null,
            previousCompletedMessageId: null,
            previousCompletedSeq: null,
            agentStreak: 0,
          },
          replyToSenderId: null,
        },
      },
      { kind: "input", content: "Original parent knowledge" },
      context,
    );
    const submission = await f.harness.submission(
      admitted.submissionId,
      context,
    );
    if (!submission) throw new Error("Original native input was not admitted");
    await submission.wait(context);
    await f.conversation.waitForIdle(context);
    const task = await f.spawn({
      mode: "fork",
      task: "Inspect only the requested inherited knowledge",
    });
    await f.terminal(task);
    const operations = f.vessel.calls.map((call) => call.method);
    expect(operations.indexOf("runtime.createEntity")).toBeLessThan(
      operations.indexOf("importChannelKnowledge"),
    );
    expect(operations.indexOf("importChannelKnowledge")).toBeLessThan(
      operations.indexOf("recordTaskProvenance"),
    );
    expect(operations).not.toContain("subscribeChannel");
    const imported = f.vessel.calls.find(
      (call) => call.method === "importChannelKnowledge",
    )!.args[0] as {
      knowledge: { history: unknown; anchors: unknown[] };
      contextId: string;
      channelId: string;
    };
    expect(JSON.stringify(imported.knowledge.history)).toContain(
      "Original parent knowledge",
    );
    expect(imported.knowledge.anchors).toHaveLength(1);
    expect(imported.knowledge.history).not.toHaveProperty("tasks");
    expect(imported.knowledge.history).not.toHaveProperty("documents");
    const run = f.vessel.runs()[0]!;
    expect(imported.contextId).toBe(run.childContextId);
    expect(imported.channelId).toBe(run.taskChannelId);
    const seed = f.vessel.publicationCalls.find((publication) =>
      publication.key?.startsWith("subagent-seed:"),
    )!;
    expect(JSON.stringify(seed.event)).toContain("Fork Assignment Boundary");
    expect(f.faux.state.callCount).toBe(1);
  });

  it("refuses a changed child resource response without rebinding its original admitted context", async () => {
    const f = await fixture();
    f.vessel.changedContext = true;
    const task = await f.spawn();
    await expect(f.terminal(task)).rejects.toThrow(
      "changed its admitted resource identity",
    );
    expect(f.vessel.created.size).toBe(0);
    const originalContext = [...f.vessel.admittedContexts][0]!;
    await f.conversation.abort(context);
    expect(f.vessel.admittedContexts.size).toBe(0);
    expect(
      f.vessel.calls.find((call) => call.method === "runtime.destroyContext")!
        .args,
    ).toEqual([{ contextId: originalContext, recursive: true }]);
  });

  it("refuses changed effective child settings before card or task seed while retaining the original owned plan", async () => {
    const f = await fixture();
    f.vessel.changedSettings = true;
    const task = await f.spawn();
    await expect(f.terminal(task)).rejects.toThrow(
      "changed original thinkingLevel",
    );
    expect(f.vessel.runs()[0]?.status).toBe("starting");
    expect(
      f.vessel.publicationCalls.some(
        (publication) =>
          publication.event.kind === "task.started" ||
          publication.key?.startsWith("subagent-seed:"),
      ),
    ).toBe(false);
    f.vessel.changedSettings = false;
    await f.retry(task);
    expect(f.vessel.runs()[0]?.status).toBe("running");
    expect(f.vessel.created.size).toBe(1);
  });

  it("retains exact failed cancellation cleanup until the admitted child context is actually destroyed", async () => {
    const f = await fixture();
    f.vessel.failCreateResponse = true;
    const id = await f.spawn();
    await expect(f.terminal(id)).rejects.toThrow(
      "Original accepted entity response lost",
    );
    const childContext = [...f.vessel.admittedContexts][0]!;
    f.vessel.failDestroy = new Error(
      "Original owned context destruction failed",
    );
    await expect(f.conversation.abort(context)).rejects.toThrow(
      f.vessel.failDestroy.message,
    );
    expect(f.vessel.admittedContexts.has(childContext)).toBe(true);
    f.vessel.failDestroy = null;
    await f.retry(id);
    expect(f.vessel.admittedContexts.size).toBe(0);
    expect((await f.harness.getTask(id, context))?.state).toMatchObject({
      status: "terminal",
      outcome: { status: "aborted" },
    });
    const destroyed = f.vessel.calls.filter(
      (c) => c.method === "runtime.destroyContext",
    );
    expect(destroyed).toHaveLength(2);
    expect(destroyed[1]!.args).toEqual(destroyed[0]!.args);
  });
});
