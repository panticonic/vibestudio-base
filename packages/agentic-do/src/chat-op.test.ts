/** Product-facing chat, inspection, configuration and retained child-resource invariants.
 * Native execution lifecycle/recovery is exercised by the native-* suites; this
 * fixture replaces only external host/channel transport boundaries. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNativeVesselTestDO as createTestDO } from "./testing/native-vessel.js";
import { rpcMethodAuthority, type RpcClient } from "@vibestudio/rpc";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  AGENTIC_PROTOCOL_VERSION,
  type AgenticEvent,
  type ParticipantRef,
} from "@workspace/agentic-protocol";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import type { ChannelEvent, ParticipantDescriptor } from "@workspace/harness";
import type {
  VcsCompareResult,
  VcsStatusResult,
} from "@vibestudio/service-schemas/vcs";
import type { MissionRecord } from "@vibestudio/automation/mission";
import { AgentVesselBase, type SubagentIdentity } from "./agent-vessel.js";
import type { ChannelClient } from "./channel-client.js";
import { type Context, type JsonValue } from "@panticonic/pi-chord";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import { createModels, fauxProvider } from "@panticonic/pi-ai";
import {
  Harness,
  MemoryStorage,
  createRegistry,
  defineExtension,
  DirectToolResultEntry,
  type ToolRegistration,
  type JsonObject,
} from "@panticonic/pi-durable";
import type { NativeChannelIntake } from "./native-channel-session.js";
import {
  getChannelPolicy,
  type ChannelCallDescriptor,
} from "@workspace/channel-policies";
const methodBuilders = getChannelPolicy(
  "agentic.conversation.v1",
).callEventPayload!;

const sessions: Harness[] = [];
const databases: Array<{ close(): void }> = [];
afterEach(async () => {
  const results = await Promise.allSettled(
    sessions.splice(0).map((session) => session.close(BACKGROUND_CONTEXT)),
  );
  for (const database of databases.splice(0)) database.close();
  vi.restoreAllMocks();
  for (const result of results)
    if (result.status === "rejected") throw result.reason;
});
async function runTool(
  tool: ToolRegistration,
  args: JsonObject,
): Promise<JsonValue> {
  const models = createModels();
  const provider = fauxProvider();
  models.setProvider(provider.provider);
  const registry = createRegistry();
  registry.install(
    defineExtension({ name: "product-domain-tool", tools: [tool] }),
  );
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    BACKGROUND_CONTEXT,
  );
  sessions.push(harness);
  const conversation = await harness.createConversation(
    {
      ownership: { kind: "ownerless" },
      agent: { model: { provider: "faux", modelId: "faux-1" }, tools: [tool] },
    },
    BACKGROUND_CONTEXT,
  );
  const taskId = await conversation.invokeTool(
    {
      id: "domain-call",
      name: tool.name,
      arguments: args,
    },
    BACKGROUND_CONTEXT,
  );
  const task = await harness.waitForTask(taskId, BACKGROUND_CONTEXT);
  if (task.state.outcome.status !== "completed")
    throw new Error(
      task.state.outcome.status === "failed"
        ? task.state.outcome.error.message
        : "Domain tool aborted",
    );
  expect(provider.state.callCount).toBe(0);
  const entries = await conversation.entries(
    {
      minEntryId: task.state.outcome.result.entryId,
      maxEntryId: task.state.outcome.result.entryId,
    },
    1,
    undefined,
    BACKGROUND_CONTEXT,
  );
  const entry = entries.items[0];
  if (!entry || !DirectToolResultEntry.is(entry))
    throw new Error("Domain task has no genuine direct tool result");
  const result = entry.data["result"];
  if (result === undefined) throw new Error("Direct domain result is missing");
  return result;
}

const AGENT_ID = "do:workers/test:TestAgent:agent-key";
const CHANNEL = "chan-1";
const TEST_AGENT_ENV = {
  __objectKey: "agent-key",
  WORKER_SOURCE: "workers/test",
  WORKER_CLASS_NAME: "TestAgent",
  WORKER_EFFECTIVE_VERSION: "a".repeat(64),
  WORKER_SOURCE_REF: `state:${"b".repeat(64)}`,
} as const;
const WEATHER_TYPE = {
  typeId: "weather",
  displayMode: "row" as const,
  stateSchema: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
    additionalProperties: false,
  },
};
async function waitForCall(
  vessel: TestVessel,
): Promise<{ callId: string; method: string }> {
  return vessel.firstChannelCall;
}
function automationRecord(
  overrides: Partial<MissionRecord> = {},
): MissionRecord {
  return {
    schemaVersion: 3,
    missionId: "mission-daily",
    name: "Daily check",
    revision: 1,
    charter: {
      summary: "Check the project every morning.",
      execution: {
        kind: "agent",
        image: {
          source: "workers/agent",
          effectiveVersion: "a".repeat(64),
          ref: `state:${"b".repeat(64)}`,
          className: "Agent",
          objectKey: "daily",
        },
        action: { kind: "prompt", text: "Check the project." },
        conversation: {
          mode: "continue",
          channelId: CHANNEL,
          contextId: "ctx-1",
          executorId: AGENT_ID,
        },
        operations: [],
      },
      trigger: {
        kind: "cron",
        expression: "5 5 * * THU",
        timezone: "America/New_York",
      },
    },
    owner: { userId: "alice" },
    state: "active",
    revisionDigest: "b".repeat(64),
    authorityPlan: {
      schemaVersion: 1,
      digest: "c".repeat(64),
      artifactRef: `authority-plan:${"c".repeat(64)}`,
      compilerVersion: "test",
      catalogDigest: "d".repeat(64),
    },
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    activatedAt: 1_700_000_000_000,
    runCount: 0,
    authority: { requestIds: [], grantIds: [], denialIds: [] },
    ...overrides,
  };
}
class TestVessel extends AgentVesselBase {
  callerIdForTest: string | null = null;

  callerKindForTest: string | null = null;

  blobImageReaderForTest: ((digest: string) => Promise<string | null>) | null =
    null;

  automationLaunchForTest: MissionRecord | null = null;

  automationVisibleForTest: MissionRecord[] | null = null;

  credentialConnectForTest: (() => Promise<Record<string, unknown>>) | null =
    null;

  readonly automationLaunchCalls: Array<{
    args: unknown[];
    options?: unknown;
  }> = [];

  readonly automationAuthorityCalls: Array<{
    method: string;
    args: unknown[];
  }> = [];

  readonly automationControlCalls: Array<{
    method: string;
    args: unknown[];
    options?: unknown;
  }> = [];

  readonly channelPublishFailures = new Set<string>();
  private resolveFirstChannelCall!: (call: {
    callId: string;
    method: string;
  }) => void;
  readonly firstChannelCall = new Promise<{ callId: string; method: string }>(
    (resolve) => {
      this.resolveFirstChannelCall = resolve;
    },
  );
  private readonly methodRoutes = new Map<string, ChannelCallDescriptor>();

  readonly channelStub = {
    published: [] as Array<{
      channelId: string;
      event: AgenticEvent;
      idempotencyKey?: string;
    }>,
    messageTypes: new Map<string, Record<string, unknown>>(),
    calls: [] as Array<{
      callId: string;
      targetPid: string;
      method: string;
      args: unknown;
    }>,
    participants: [] as Array<{
      participantId: string;
      ref: ParticipantRef;
      metadata: Record<string, unknown>;
    }>,
    subscriptions: [] as Array<{ channelId: string; participantId: string }>,
    sent: [] as Array<{
      channelId: string;
      participantId: string;
      messageId: string;
      content: string;
      options?: Record<string, unknown>;
    }>,
    replay: new Map<string, ChannelEvent[]>(),
    envelopes: new Map<string, ChannelEvent>(),
    channelEnvelopes: new Map<string, ChannelEvent>(),
  };

  readonly operationLog: string[] = [];

  channelClientCreations = 0;

  writeHotPathTracesForTest(count: number, channelId = CHANNEL): void {
    for (let index = 0; index < count; index += 1) {
      this.traceHotPath(channelId, "test.trace", { details: { index } });
    }
  }

  hotPathTraceCountForTest(channelId = CHANNEL): number {
    return Number(
      this.sql
        .exec(
          `SELECT COUNT(*) AS count
             FROM agent_hot_path_trace
            WHERE channel_id = ?`,
          channelId,
        )
        .toArray()[0]?.["count"] ?? 0,
    );
  }

  protected override get rpcCallerId(): string | null {
    return this.callerIdForTest;
  }

  protected override get rpcCallerKind(): string | null {
    return this.callerKindForTest;
  }

  protected override get rpcRequestId(): string | null {
    return "request-for-test";
  }

  protected override participantId(): string {
    return AGENT_ID;
  }

  protected override getParticipantInfo(): ParticipantDescriptor {
    return {
      type: "agent",
      name: "TestAgent",
      handle: "testagent",
    } as ParticipantDescriptor;
  }

  protected override get rpc(): RpcClient {
    const base = super.rpc;
    const vessel = this;
    return new Proxy(base, {
      get(target, property, receiver) {
        if (property === "call") {
          return async (
            targetId: string,
            method: string,
            args: unknown[],
            options?: unknown,
          ) => {
            if (
              targetId === "main" &&
              method === "credentials.connect" &&
              vessel.credentialConnectForTest
            ) {
              return vessel.credentialConnectForTest();
            }
            if (
              targetId === "main" &&
              method === "blobstore.getBase64" &&
              vessel.blobImageReaderForTest
            ) {
              return vessel.blobImageReaderForTest(String(args[0]));
            }
            if (
              (vessel.automationLaunchForTest ||
                vessel.automationVisibleForTest) &&
              targetId === "main" &&
              method === "authority.compileAuthorityPlan"
            ) {
              vessel.automationAuthorityCalls.push({ method, args });
              return {
                schemaVersion: 1,
                digest: "c".repeat(64),
                artifactRef: `authority-plan:${"c".repeat(64)}`,
                compilerVersion: "test",
                catalogDigest: "d".repeat(64),
              };
            }
            if (
              vessel.automationLaunchForTest &&
              targetId === "main" &&
              method === "authority.acquireForCurrentTask"
            ) {
              vessel.automationAuthorityCalls.push({ method, args });
              return {
                requestIds: [],
                grantIds: ["grant:task"],
                denialIds: [],
              };
            }
            if (
              (vessel.automationLaunchForTest ||
                vessel.automationVisibleForTest) &&
              targetId === "main" &&
              method === "workers.resolveService" &&
              args[0] === "vibestudio.missions.v1"
            ) {
              return { kind: "durable-object", targetId: "do:missions" };
            }
            if (
              vessel.automationLaunchForTest &&
              targetId === "do:missions" &&
              method === "launch"
            ) {
              vessel.automationLaunchCalls.push({ args, options });
              return vessel.automationLaunchForTest;
            }
            if (
              vessel.automationVisibleForTest &&
              targetId === "do:missions" &&
              method === "list"
            ) {
              return vessel.automationVisibleForTest;
            }
            if (
              vessel.automationVisibleForTest &&
              targetId === "do:missions" &&
              ["pause", "resume", "runNow", "retire"].includes(method)
            ) {
              vessel.automationControlCalls.push({ method, args, options });
              const mission = vessel.automationVisibleForTest.find(
                (candidate) => candidate.missionId === args[0],
              );
              if (!mission) throw new Error("unknown test automation");
              return {
                ...mission,
                state:
                  method === "pause"
                    ? "paused"
                    : method === "retire"
                      ? "retired"
                      : "active",
              };
            }
            return target.call(targetId, method, args, options as never);
          };
        }
        const value = Reflect.get(target, property, receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  protected override createChannelClient(channelId: string): ChannelClient {
    this.channelClientCreations += 1;
    return this.makeChannelStub(channelId) as unknown as ChannelClient;
  }

  async executeAutomationLaunchForTest(input: JsonObject): Promise<unknown> {
    const tool = this.createAutomationLaunchTool(CHANNEL, {
      invocationId: "invocation-daily",
      commandId: "command-daily",
      rpc: this.rpc,
    });
    return runTool(tool, input);
  }

  async executeAutomationControlForTest(input: JsonObject): Promise<unknown> {
    const tool = this.createAutomationControlTool(CHANNEL, {
      invocationId: "invocation-control",
      commandId: "command-control",
      rpc: this.rpc,
    });
    return runTool(tool, input);
  }

  async registerSubscriptionForTest(
    channelId = CHANNEL,
    config?: unknown,
  ): Promise<void> {
    this.ensureIdentity();
    await this.subscriptions.subscribe({
      channelId,
      contextId: "ctx-1",
      descriptor: this.getParticipantInfo(),
      config,
      replay: false,
    });
  }

  private makeChannelStub(channelId: string) {
    const stub = this.channelStub;
    const failures = this.channelPublishFailures;
    const operationLog = this.operationLog;
    const getReplayAfter = vi.fn(
      async (request: {
        after: number;
        limit?: number;
        throughSeq?: number;
      }) => {
        const all = (stub.replay.get(channelId) ?? []).filter(
          (event) =>
            (event.id ?? 0) > request.after &&
            (request.throughSeq === undefined ||
              (event.id ?? 0) <= request.throughSeq),
        );
        const snapshotLastSeq =
          request.throughSeq ??
          all.reduce(
            (maximum, event) => Math.max(maximum, event.id ?? 0),
            request.after,
          );
        const logEvents = all.slice(0, request.limit ?? 500);
        return {
          mode: "after" as const,
          logEvents,
          snapshots: [],
          ready: {
            totalCount: all.length,
            envelopeCount: all.length,
            snapshotLastSeq,
            replayToId: logEvents.at(-1)?.id,
            hasMoreAfter: logEvents.length < all.length,
          },
        };
      },
    );
    return {
      publishAgenticEvent: vi.fn(
        async (
          pid: string,
          event: AgenticEvent,
          opts?: { idempotencyKey?: string },
        ) => {
          if (opts?.idempotencyKey && failures.has(opts.idempotencyKey)) {
            throw new Error(`publish failed: ${opts.idempotencyKey}`);
          }
          const envelopeId = opts?.idempotencyKey
            ? `ik:${opts.idempotencyKey}`
            : undefined;
          const channelEnvelopeId = envelopeId
            ? `${channelId}\u0000${envelopeId}`
            : undefined;
          const existing = channelEnvelopeId
            ? stub.channelEnvelopes.get(channelEnvelopeId)
            : undefined;
          stub.published.push({
            channelId,
            event,
            idempotencyKey: opts?.idempotencyKey,
          });
          if (existing) return { id: existing.id };
          const id = stub.published.length;
          if (channelEnvelopeId && envelopeId) {
            stub.channelEnvelopes.set(channelEnvelopeId, {
              id,
              messageId: envelopeId,
              type: AGENTIC_EVENT_PAYLOAD_KIND,
              payload: event,
              senderId: pid,
              ts: Date.now(),
            } as ChannelEvent);
          }
          return { id };
        },
      ),
      getMessageType: vi.fn(
        async (typeId: string) => stub.messageTypes.get(typeId) ?? null,
      ),
      getMessageTypes: vi.fn(async () => [...stub.messageTypes.values()]),
      getParticipants: vi.fn(async () => stub.participants),
      callMethod: vi.fn(
        async (
          callerPid: string,
          targetPid: string,
          callId: string,
          method: string,
          args: unknown,
          options: { invocationId?: string; transportCallId?: string } = {},
        ) => {
          stub.calls.push({ callId, targetPid, method, args });
          const route: ChannelCallDescriptor = {
            channelId,
            caller: { kind: "agent", id: callerPid as never },
            target: { kind: "user", id: targetPid as never },
            invocationId: options.invocationId ?? callId,
            transportCallId: options.transportCallId ?? callId,
            method,
            args,
            createdAt: new Date().toISOString(),
          };
          this.methodRoutes.set(callId, route);
          stub.channelEnvelopes.set(`${channelId}\u0000${route.invocationId}`, {
            id: 1,
            messageId: route.invocationId,
            type: AGENTIC_EVENT_PAYLOAD_KIND,
            payload: methodBuilders.started(route),
            senderId: callerPid,
            ts: Date.now(),
          });
          this.resolveFirstChannelCall({ callId, method });
        },
      ),
      cancelCall: vi.fn(async (_caller: string, callId: string) => {
        const key = `${channelId}\u0000terminal:${callId}`;
        if (stub.channelEnvelopes.has(key)) return;
        const route = this.methodRoutes.get(callId);
        if (!route)
          throw new Error(
            "Fixture cancellation requires its original channel admission",
          );
        stub.channelEnvelopes.set(key, {
          id: 2,
          messageId: `terminal:${callId}`,
          type: AGENTIC_EVENT_PAYLOAD_KIND,
          payload: methodBuilders.cancelled({
            descriptor: route,
            actor: route.caller,
            reason: "cancelled",
            createdAt: route.createdAt,
          }),
          senderId: route.caller.id,
          ts: Date.now(),
        });
      }),
      getReplayAfter,
      replayAfterPages: async function* (request: {
        after: number;
        limit?: number;
        throughSeq?: number;
      }) {
        let after = request.after;
        let throughSeq = request.throughSeq;
        for (;;) {
          const page = await getReplayAfter({ ...request, after, throughSeq });
          yield page;
          if (!page.ready.hasMoreAfter) return;
          after = page.ready.replayToId!;
          throughSeq ??= page.ready.snapshotLastSeq;
        }
      },
      getEnvelope: vi.fn(
        async (envelopeId: string) =>
          stub.channelEnvelopes.get(`${channelId}\u0000${envelopeId}`) ??
          stub.envelopes.get(envelopeId) ??
          null,
      ),
      send: vi.fn(
        async (
          participantId: string,
          messageId: string,
          content: string,
          options?: Record<string, unknown>,
        ) => {
          stub.sent.push({
            channelId,
            participantId,
            messageId,
            content,
            options,
          });
        },
      ),
      recordTaskProvenance: vi.fn(async () => undefined),
      relationshipState: vi.fn(async () => ({ revision: 0, active: false })),
      join: vi.fn(
        async (input: { participantId: string; revision: number }) => {
          operationLog.push(`channel:${channelId}:join`);
          stub.subscriptions.push({
            channelId,
            participantId: input.participantId,
          });
          return {
            ok: true,
            channelConfig: {},
            envelope: {
              logEvents: [],
              ready: { totalCount: 0, envelopeCount: 0 },
            },
            participantId: input.participantId,
            revision: input.revision,
          };
        },
      ),
      leave: vi.fn(async () => {
        operationLog.push(`channel:${channelId}:leave`);
      }),
      getConfig: vi.fn(async () => ({})),
    };
  }

  async deliverTerminal(
    transportCallId: string,
    kind:
      | "invocation.completed"
      | "invocation.failed"
      | "invocation.cancelled"
      | "invocation.abandoned",
    payload: Record<string, unknown>,
  ): Promise<void> {
    const route = this.methodRoutes.get(transportCallId);
    if (!route)
      throw new Error(
        "Fixture terminal requires the original channel admission",
      );
    const outcome =
      kind === "invocation.cancelled"
        ? methodBuilders.cancelled({
            descriptor: route,
            actor: route.caller,
            reason: String(payload["reason"] ?? "cancelled"),
            createdAt: route.createdAt,
          })
        : methodBuilders.terminal({
            descriptor: route,
            result:
              kind === "invocation.completed"
                ? payload["result"]
                : { error: payload["error"] },
            isError: kind !== "invocation.completed",
            createdAt: route.createdAt,
          });
    const event: ChannelEvent = {
      id: 2,
      messageId: `terminal:${transportCallId}`,
      type: AGENTIC_EVENT_PAYLOAD_KIND,
      payload: outcome,
      senderId: AGENT_ID,
      ts: Date.now(),
    };
    this.channelStub.channelEnvelopes.set(
      `${CHANNEL}\u0000${event.messageId}`,
      event,
    );
    await this.selectForTest(CHANNEL, event);
  }
  protected override async refreshNativeChannelConfiguration(
    _channelId: string,
  ): Promise<void> {}
  rejectAgentOpenForTest = vi.fn(async (): Promise<Harness> => {
    throw new Error("Inspection entered native session admission");
  });
  protected override agentSession(_context?: Context): Promise<Harness> {
    return this.rejectAgentOpenForTest();
  }
  selectForTest(
    channelId: string,
    event: ChannelEvent,
  ): Promise<{ targetChannelId: string; intake: NativeChannelIntake }> {
    return (
      this as unknown as {
        selectNativeChannelIntake(
          channelId: string,
          event: ChannelEvent,
          context: unknown,
        ): Promise<{ targetChannelId: string; intake: NativeChannelIntake }>;
      }
    ).selectNativeChannelIntake(channelId, event, {
      version: 1,
      relationships: [],
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
    });
  }
  tablesForTest(): string[] {
    return this.sql
      .exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .toArray()
      .map((row) => String(row["name"]));
  }
}
class PromptEventProbe extends TestVessel {
  useDeliveredDecisionContext = false;

  consumePayloadKind: string | null = null;

  protected override async onChannelEvent(
    _channelId: string,
    event: ChannelEvent,
  ): Promise<boolean> {
    return event.type === this.consumePayloadKind;
  }

  protected override async shouldRespond(
    channelId: string,
    event: ChannelEvent,
    deliveredContext?: import("@workspace/pubsub").ChannelAgenticContext,
  ): Promise<boolean> {
    return this.useDeliveredDecisionContext
      ? super.shouldRespond(channelId, event, deliveredContext)
      : true;
  }

  markEmptyRosterFresh(channelId: string): void {
    this.setStateValue(`agent:roster:${channelId}`, "[]");
  }
}
async function makeVessel(): Promise<TestVessel> {
  const { instance, db } = await createTestDO(TestVessel, TEST_AGENT_ENV);
  // Register a subscription row so the card path has a participant id, without
  // admitting an execution session; transport-only methods need membership.
  await instance.registerSubscriptionForTest();
  databases.push(db);
  return instance;
}
async function makePromptProbe(config?: unknown): Promise<PromptEventProbe> {
  const { instance, db } = await createTestDO(PromptEventProbe, TEST_AGENT_ENV);
  await instance.registerSubscriptionForTest(CHANNEL, config);
  instance.markEmptyRosterFresh(CHANNEL);
  databases.push(db);
  return instance;
}
function customChannelEvent(
  type: string,
  overrides: Partial<ChannelEvent> = {},
): ChannelEvent {
  return {
    id: 17,
    messageId: "custom-envelope-17",
    type,
    payload: { incidentId: "inc-17", severity: "high" },
    senderId: "app:incident-feed",
    senderMetadata: {
      type: "app",
      name: "Incident feed",
      handle: "incidents",
      privateCredential: "must-not-leak",
    },
    ts: 1_786_400_000_000,
    ...overrides,
  };
}
async function expectedEvalCaller(): Promise<string> {
  const key = sha256HexSyncText(`${AGENT_ID}\0${CHANNEL}`).slice(0, 40);
  return `do:vibestudio/internal:EvalDO:${key}`;
}
describe("AgentVesselBase hot-path trace retention", () => {
  it("amortizes retention sweeps while keeping the durable trace bounded", async () => {
    const { instance } = await createTestDO(TestVessel, TEST_AGENT_ENV);

    instance.writeHotPathTracesForTest(576);
    expect(instance.hotPathTraceCountForTest()).toBe(563);

    instance.writeHotPathTracesForTest(1);
    expect(instance.hotPathTraceCountForTest()).toBe(500);
  });
});
describe("AgentVesselBase activation-local inspection", () => {
  it("admits the authenticated channel DO before enforcing its exact identity", async () => {
    const vessel = await makeVessel();

    expect(rpcMethodAuthority(vessel, "readAgentInspection")).toMatchObject({
      website: {
        kind: "closed",
        reason:
          "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
      } as const,
      principals: ["host", "code"],
      effect: { kind: "open" },
      tier: "open",
      sensitivity: "read",
    });
  });

  it("returns a truthful unloaded snapshot without entering stalled native session admission", async () => {
    const vessel = await makeVessel();
    vessel.rejectAgentOpenForTest.mockImplementation(
      () => new Promise(() => {}),
    );
    vessel.callerKindForTest = "do";
    vessel.callerIdForTest = "do:workers/pubsub-channel:PubSubChannel:chan-1";

    await expect(
      vessel.readAgentInspection(CHANNEL, "getDebugState"),
    ).resolves.toMatchObject({
      result: {
        conversations: {
          [CHANNEL]: {
            loaded: false,
            channelId: CHANNEL,
            observation: "not-loaded",
          },
        },
      },
    });
    expect(vessel.rejectAgentOpenForTest).not.toHaveBeenCalled();
  });

  it("does not populate execution storage while inspecting an unused activation", async () => {
    const vessel = await makeVessel();
    vessel.callerKindForTest = "do";
    vessel.callerIdForTest = "do:workers/pubsub-channel:PubSubChannel:chan-1";

    const tables = vessel.tablesForTest();
    await expect(
      vessel.readAgentInspection(CHANNEL, "getDebugState"),
    ).resolves.toMatchObject({
      result: { conversations: { [CHANNEL]: { loaded: false } } },
    });
    expect(vessel.tablesForTest()).toEqual(tables);
    expect(vessel.rejectAgentOpenForTest).not.toHaveBeenCalled();
  });

  it("rejects inspection calls from anything except a channel DO or the server", async () => {
    const vessel = await makeVessel();
    vessel.callerKindForTest = "panel";
    vessel.callerIdForTest = "panel:untrusted";

    await expect(
      vessel.readAgentInspection(CHANNEL, "getDebugState"),
    ).rejects.toThrow(/refusing caller/u);
  });
});
describe("AgentVesselBase.chatOp", () => {
  it("rejects a caller that is not this agent's own EvalDO", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = "do:vibestudio/internal:EvalDO:someoneelse";
    await expect(vessel.chatOp(CHANNEL, "getMessageTypes", [])).rejects.toThrow(
      /only this agent's own EvalDO/,
    );
  });

  it("rejects when there is no verified caller", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = null;
    await expect(vessel.chatOp(CHANNEL, "getMessageTypes", [])).rejects.toThrow(
      /refusing caller/,
    );
  });

  it("accepts the agent's own EvalDO (key matches the eval service formula)", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = await expectedEvalCaller();
    vessel.channelStub.messageTypes.set("weather", WEATHER_TYPE);
    const types = await vessel.chatOp(CHANNEL, "getMessageTypes", []);
    expect(Array.isArray(types)).toBe(true);
    expect((types as unknown[]).length).toBe(1);
  });

  it("replayEnvelope returns one durable envelope by id and null when absent", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = await expectedEvalCaller();
    const event = {
      id: 7,
      type: "message",
      payload: { text: "hello" },
      senderId: "panel:user",
      ts: Date.now(),
    } as ChannelEvent;
    vessel.channelStub.envelopes.set("env-7", event);

    await expect(
      vessel.chatOp(CHANNEL, "replayEnvelope", ["env-7"]),
    ).resolves.toEqual(event);
    await expect(
      vessel.chatOp(CHANNEL, "replayEnvelope", ["missing"]),
    ).resolves.toBeNull();
    await expect(
      vessel.chatOp(CHANNEL, "replayEnvelope", [""]),
    ).resolves.toBeNull();
  });

  it("getParticipants exposes the canonical chat participant shape", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = await expectedEvalCaller();
    vessel.channelStub.participants = [
      {
        participantId: "participant-1",
        ref: { kind: "agent", id: "agent-1" },
        metadata: { type: "agent", name: "Agent" },
      },
    ];

    await expect(
      vessel.chatOp(CHANNEL, "getParticipants", []),
    ).resolves.toEqual([
      {
        id: "participant-1",
        ref: { kind: "agent", id: "agent-1" },
        type: "agent",
        name: "Agent",
        isPerson: false,
        isAgent: true,
      },
    ]);
  });

  it("configureAgent + describeSelf expose per-agent config to the eval `agent` binding", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = await expectedEvalCaller();

    const updated = (await vessel.chatOp(CHANNEL, "configureAgent", [
      { model: "openai:gpt-5.3", thinkingLevel: "high" },
    ])) as { model: string; thinkingLevel: string };
    expect(updated.model).toBe("openai:gpt-5.3");
    expect(updated.thinkingLevel).toBe("high");

    const snapshot = (await vessel.chatOp(CHANNEL, "describeSelf", [])) as {
      identity: { id: string };
      config: { model: string };
      channels: Array<{ channelId: string }>;
    };
    expect(snapshot.identity.id).toBe(AGENT_ID);
    // Per-agent: the model set above is what describeSelf reports.
    expect(snapshot.config.model).toBe("openai:gpt-5.3");
    expect(snapshot.channels.some((c) => c.channelId === CHANNEL)).toBe(true);

    const readSnapshot = (await vessel.describeEvalOwner(CHANNEL)) as {
      identity: { id: string };
    };
    expect(readSnapshot.identity.id).toBe(AGENT_ID);
  });

  it("configureAgent validates its patch (rejects an empty model)", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = await expectedEvalCaller();
    await expect(
      vessel.chatOp(CHANNEL, "configureAgent", [{ model: "" }]),
    ).rejects.toThrow(/model/);
  });

  it("registerMessageType publishes messageType.registered AS the agent", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = await expectedEvalCaller();
    await vessel.chatOp(CHANNEL, "registerMessageType", [
      {
        typeId: "weather",
        displayMode: "row",
        source: { type: "file", path: "renderers/weather.tsx" },
        stateSchema: WEATHER_TYPE.stateSchema,
      },
    ]);
    const published = vessel.channelStub.published;
    expect(published).toHaveLength(1);
    expect(published[0]!.event.kind).toBe("messageType.registered");
    expect(published[0]!.event.actor.kind).toBe("agent");
    expect(published[0]!.event.actor.id).toBe(AGENT_ID);
  });

  it("publishCustomMessage routes through the card manager and returns { messageId, pubsubId }", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = await expectedEvalCaller();
    vessel.channelStub.messageTypes.set("weather", WEATHER_TYPE);
    const result = (await vessel.chatOp(CHANNEL, "publishCustomMessage", [
      { typeId: "weather", initialState: { city: "Berlin" } },
    ])) as { messageId: string; pubsubId: number | undefined };
    expect(typeof result.messageId).toBe("string");
    // The stub returns { id: published.length }; the first publish is id 1, and
    // the handle must surface it (harmonized with the panel client).
    expect(result.pubsubId).toBe(1);
    const started = vessel.channelStub.published.find(
      (p) => p.event.kind === "custom.started",
    );
    expect(started).toBeDefined();
    expect(started!.event.actor.kind).toBe("agent");
  });

  it("launches one active automation and publishes its running inspector before returning", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = await expectedEvalCaller();
    vessel.automationLaunchForTest = {
      schemaVersion: 3,
      missionId: "mission-daily",
      name: "Daily check",
      revision: 1,
      charter: {
        summary: "Check the project every morning.",
        execution: {
          kind: "agent",
          image: {
            source: "workers/agent",
            effectiveVersion: "a".repeat(64),
            ref: `state:${"b".repeat(64)}`,
            className: "Agent",
            objectKey: "daily",
          },
          action: { kind: "prompt", text: "Check the project." },
          conversation: { mode: "fresh" },
          operations: [],
        },
        trigger: {
          kind: "cron",
          expression: "5 5 * * THU",
          timezone: "America/New_York",
        },
      },
      owner: { userId: "alice" },
      state: "active",
      revisionDigest: "b".repeat(64),
      authorityPlan: {
        schemaVersion: 1,
        digest: "c".repeat(64),
        artifactRef: `authority-plan:${"c".repeat(64)}`,
        compilerVersion: "test",
        catalogDigest: "d".repeat(64),
      },
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      activatedAt: 1_700_000_000_000,
      runCount: 0,
      authority: { requestIds: [], grantIds: [], denialIds: [] },
    };

    const input = {
      name: "Daily check",
      summary: "Check the project every morning.",
      action: { kind: "prompt", text: "Check the project." },
      trigger: {
        kind: "cron",
        expression: "5 5 * * THU",
        timezone: "America/New_York",
      },
      operations: [],
    };
    const pillKey = "automation:instituted:mission-daily";
    vessel.channelPublishFailures.add(pillKey);
    await expect(vessel.executeAutomationLaunchForTest(input)).rejects.toThrow(
      `publish failed: ${pillKey}`,
    );
    expect(vessel.channelStub.published).toHaveLength(0);

    vessel.channelPublishFailures.delete(pillKey);
    await expect(
      vessel.executeAutomationLaunchForTest(input),
    ).resolves.toMatchObject({
      details: { missionId: "mission-daily", state: "active" },
    });

    expect(vessel.automationLaunchCalls).toHaveLength(2);
    expect(vessel.automationLaunchCalls).toEqual(
      Array.from({ length: 2 }, () => ({
        args: [
          {
            name: "Daily check",
            charter: {
              summary: "Check the project every morning.",
              execution: {
                kind: "agent",
                image: {
                  source: "workers/test",
                  effectiveVersion: "a".repeat(64),
                  ref: `state:${"b".repeat(64)}`,
                  className: "TestAgent",
                  objectKey: "agent-key",
                },
                action: { kind: "prompt", text: "Check the project." },
                conversation: {
                  mode: "continue",
                  channelId: CHANNEL,
                  contextId: "ctx-1",
                  executorId: AGENT_ID,
                },
                operations: [],
              },
              trigger: {
                kind: "cron",
                expression: "5 5 * * THU",
                timezone: "America/New_York",
              },
            },
          },
        ],
        options: {
          idempotencyKey: expect.stringMatching(
            /automation:launch:.*:[0-9a-f]{64}$/,
          ),
        },
      })),
    );
    expect(vessel.automationLaunchCalls[1]!.options).toEqual(
      vessel.automationLaunchCalls[0]!.options,
    );
    expect(vessel.channelStub.published).toContainEqual(
      expect.objectContaining({
        idempotencyKey: pillKey,
        event: expect.objectContaining({
          kind: "automation.instituted",
          payload: expect.objectContaining({
            definition: expect.objectContaining({
              missionId: "mission-daily",
              state: "active",
              action: "prompt",
              schedule: {
                kind: "cron",
                expression: "5 5 * * THU",
                timezone: "America/New_York",
              },
            }),
          }),
        }),
      }),
    );

    await vessel.executeAutomationLaunchForTest({
      ...input,
      operations: [
        {
          service: "accounts",
          method: "connect",
          use: "action",
        },
      ],
    });
    expect(vessel.automationAuthorityCalls.map(({ method }) => method)).toEqual(
      ["authority.compileAuthorityPlan", "authority.acquireForCurrentTask"],
    );
    expect(vessel.automationAuthorityCalls[1]!.args).toEqual([
      { authorityPlanDigest: "c".repeat(64) },
    ]);

    await vessel.executeAutomationLaunchForTest({
      ...input,
      conversation: { mode: "fresh" },
    });
    expect(vessel.automationLaunchCalls[3]!.args).toMatchObject([
      {
        charter: {
          execution: { conversation: { mode: "fresh" } },
        },
      },
    ]);
  });

  it("pauses the sole active automation in this conversation through the native control tool", async () => {
    const vessel = await makeVessel();
    vessel.automationVisibleForTest = [
      automationRecord({
        missionId: "mission-sloths",
        name: "Sloth fun facts",
      }),
    ];

    await expect(
      vessel.executeAutomationControlForTest({ action: "pause" }),
    ).resolves.toMatchObject({
      content: [{ text: "Sloth fun facts was paused." }],
      details: { missionId: "mission-sloths", state: "paused" },
    });
    expect(vessel.automationControlCalls).toEqual([
      {
        method: "pause",
        args: ["mission-sloths"],
        options: {
          idempotencyKey: expect.stringMatching(
            /automation:control:agent-key:[0-9a-f]{64}:pause:mission-sloths/,
          ),
        },
      },
    ]);
  });

  it("requires an exact target when multiple current-conversation automations match", async () => {
    const vessel = await makeVessel();
    vessel.automationVisibleForTest = [
      automationRecord({ missionId: "mission-one", name: "One" }),
      automationRecord({ missionId: "mission-two", name: "Two" }),
    ];

    await expect(
      vessel.executeAutomationControlForTest({ action: "pause" }),
    ).rejects.toThrow("More than one automation matches");
    await expect(
      vessel.executeAutomationControlForTest({
        action: "pause",
        name: "Two",
      }),
    ).resolves.toMatchObject({ details: { missionId: "mission-two" } });
  });

  it("updateCustomMessage publishes custom.updated AS the agent and returns its pubsubId", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = await expectedEvalCaller();
    vessel.channelStub.messageTypes.set("weather", WEATHER_TYPE);
    const created = (await vessel.chatOp(CHANNEL, "publishCustomMessage", [
      { typeId: "weather", initialState: { city: "Berlin" } },
    ])) as { messageId: string };
    const pubsubId = await vessel.chatOp(CHANNEL, "updateCustomMessage", [
      created.messageId,
      { city: "Paris" },
    ]);
    // Second publish on this channel → stub id 2.
    expect(pubsubId).toBe(2);
    const updated = vessel.channelStub.published.find(
      (p) => p.event.kind === "custom.updated",
    );
    expect(updated).toBeDefined();
    expect(updated!.event.actor.kind).toBe("agent");
  });

  it("focusMessage is panel-only and resolves false", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = await expectedEvalCaller();
    await expect(
      vessel.chatOp(CHANNEL, "focusMessage", ["msg-1"]),
    ).resolves.toBe(false);
  });

  it("callMethod initiates a channel call and resolves with the delivered content", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = await expectedEvalCaller();
    const promise = vessel.chatOp(CHANNEL, "callMethod", [
      "panel-pid",
      "doThing",
      { x: 1 },
    ]);
    const call = await waitForCall(vessel);
    expect(call.method).toBe("doThing");
    await vessel.deliverTerminal(call.callId, "invocation.completed", {
      result: { ok: 42 },
    });
    await expect(promise).resolves.toEqual({ ok: 42 });
  });

  it("rejects malformed method-call arguments before serialization or dispatch", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = await expectedEvalCaller();
    const relay = vi.spyOn(
      (
        vessel as unknown as {
          channelMethodRelays: { call: (...args: unknown[]) => unknown };
        }
      ).channelMethodRelays,
      "call",
    );
    for (const args of [
      ["history", { channelId: "missing", limit: 10 }],
      ["panel-pid", "doThing"],
      [null, "doThing", {}],
    ]) {
      await expect(
        vessel.chatOp(CHANNEL, "callMethodResult", args),
      ).rejects.toThrow(
        "chat.callMethod requires (participantId: string, method: string, args: JSON value)",
      );
    }
    expect(relay).not.toHaveBeenCalled();
  });

  it("callMethodResult resolves with the full ChatMethodResult envelope", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = await expectedEvalCaller();
    const promise = vessel.chatOp(CHANNEL, "callMethodResult", [
      "panel-pid",
      "doThing",
      {},
    ]);
    const call = await waitForCall(vessel);
    await vessel.deliverTerminal(call.callId, "invocation.completed", {
      result: "hello",
    });
    await expect(promise).resolves.toEqual({ content: "hello" });
  });

  it("callMethod rejects when the channel terminal is an error", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = await expectedEvalCaller();
    const promise = vessel.chatOp(CHANNEL, "callMethod", [
      "panel-pid",
      "boom",
      {},
    ]);
    const call = await waitForCall(vessel);
    await vessel.deliverTerminal(call.callId, "invocation.failed", {
      error: "kaboom",
    });
    await expect(promise).rejects.toThrow(/kaboom/);
  });

  it("resolves the agent's own read-only inspection call without a channel deadlock", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = await expectedEvalCaller();

    await expect(
      vessel.chatOp(CHANNEL, "callMethod", [AGENT_ID, "getDebugState", {}]),
    ).resolves.toMatchObject({ participantId: AGENT_ID });
    expect(vessel.channelStub.calls).toHaveLength(0);
  });
});
describe("AgentVesselBase.onEvalProgress (live eval console streaming)", () => {
  it("publishes output against the parent invocation, not the eval effect runId", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = await expectedEvalCaller();

    await vessel.onEvalProgress({
      runId: "inv:inv-5",
      agentInvocationId: "inv-5",
      channelId: CHANNEL,
      output: "hello\nworld",
    });

    const published = vessel.channelStub.published.find(
      (p) => p.event.kind === "invocation.output",
    );
    expect(published?.event).toMatchObject({
      kind: "invocation.output",
      causality: { invocationId: "inv-5" },
      payload: { output: "hello\nworld", channel: "stdout" },
    });
  });

  it("refuses a caller that is not the agent's own EvalDO (same gate as chatOp)", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = "do:vibestudio/internal:EvalDO:someoneelse";
    await expect(
      vessel.onEvalProgress({
        runId: "inv:inv-6",
        agentInvocationId: "inv-6",
        channelId: CHANNEL,
        output: "x",
      }),
    ).rejects.toThrow(/only this agent's own EvalDO/);
  });

  it("is a no-op for empty output (no event published)", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = await expectedEvalCaller();
    await vessel.onEvalProgress({
      runId: "inv:inv-7",
      agentInvocationId: "inv-7",
      channelId: CHANNEL,
      output: "",
    });
    expect(
      vessel.channelStub.published.some(
        (p) => p.event.kind === "invocation.output",
      ),
    ).toBe(false);
  });
});
describe("AgentVesselBase.onEvalProgress authority lifecycle", () => {
  it("publishes authority suspension as structured parent-invocation progress", async () => {
    const vessel = await makeVessel();
    vessel.callerIdForTest = await expectedEvalCaller();

    await vessel.onEvalProgress({
      runId: "inv:inv-authority",
      agentInvocationId: "inv-authority",
      channelId: CHANNEL,
      activity: {
        kind: "authority-requested",
        detail: { capability: "vcs.edit", resourceKey: "repo:panels/taskflow" },
      },
    });

    expect(
      vessel.channelStub.published.find(
        (entry) => entry.event.kind === "invocation.progress",
      )?.event,
    ).toMatchObject({
      kind: "invocation.progress",
      causality: { invocationId: "inv-authority" },
      payload: {
        message: "Waiting for approval to use vcs.edit on repo:panels/taskflow",
        data: {
          eval: {
            runId: "inv:inv-authority",
            activity: "authority-pending",
          },
        },
      },
    });
  });
});
class SubagentSpawnProbe extends TestVessel {
  subagentIdentityForTest: SubagentIdentity | null = null;

  protected override subagentIdentity(): SubagentIdentity | null {
    return this.subagentIdentityForTest;
  }

  async acceptsMessageForTest(channelId: string, event: ChannelEvent) {
    return this.shouldRespond(channelId, event);
  }

  rpcCalls: Array<{ target: string; method: string; args: unknown[] }> = [];

  childSettings: Record<string, unknown> = {};

  readonly vcsResponses = new Map<string, unknown[]>();

  ownerRuntimeContextId = "ctx-1";

  childExecutionActive = false;

  protected override get rpc(): RpcClient {
    return {
      call: async (target: string, method: string, args: unknown[]) => {
        this.rpcCalls.push({ target, method, args });
        this.operationLog.push(`rpc:${target}:${method}`);
        const vcsResponses = this.vcsResponses.get(method);
        if (target === "main" && vcsResponses && vcsResponses.length > 0) {
          return vcsResponses.shift();
        }
        if (target === "main" && method === "vcs.status") {
          const contextId = String(
            (args[0] as { contextId?: unknown } | undefined)?.contextId ??
              "ctx-1",
          );
          const eventId = `event:${contextId}`;
          return semanticStatus(
            contextId,
            eventId,
            { kind: "event", eventId },
            true,
          );
        }
        if (target === "main" && method === "runtime.resolveContext") {
          return this.ownerRuntimeContextId;
        }
        if (target === "main" && method === "runtime.createSubagentContext") {
          return { contextId: "ctx-child" };
        }
        if (target === "main" && method === "runtime.createEntity") {
          const spec = args[0] as {
            stateArgs?: { agentConfig?: Record<string, unknown> };
          };
          this.childSettings = { ...(spec.stateArgs?.agentConfig ?? {}) };
          return {
            id: "do:workers/agent-worker:AiChatWorker:subagent-inv-1",
            targetId: "do:workers/agent-worker:AiChatWorker:subagent-inv-1",
          };
        }
        if (method === "getAgentSettings" && target.includes(":subagent-")) {
          return this.childSettings;
        }
        if (method === "readSubagentExecutionActivity") {
          return { active: this.childExecutionActive };
        }
        if (target === "main" && method === "workers.resolveService") {
          return {
            kind: "durable-object",
            source: "vibestudio/internal",
            className: "GadWorkspaceDO",
            objectKey: "workspace-main",
            targetId: "gad",
          };
        }
        return { ok: true, participantId: "participant-child" };
      },
    } as unknown as RpcClient;
  }

  subagentRunForTest(runId: string) {
    return this.subagentRuns.get(runId);
  }

  async addresseeRunsForTest() {
    return (await this.addresseeContext(CHANNEL)).runs;
  }

  seedSubagentStartedInParentChannelForTest(
    runId: string,
    options: { includeChildParticipantId?: boolean } = {},
  ) {
    this.channelStub.replay.set(CHANNEL, [
      {
        id: 1,
        messageId: `ik:subagent-started:${runId}`,
        type: AGENTIC_EVENT_PAYLOAD_KIND,
        payload: {
          kind: "task.started",
          actor: { kind: "agent", id: AGENT_ID, displayName: "TestAgent" },
          causality: { taskId: runId, invocationId: runId },
          payload: {
            protocol: "agentic.trajectory.v1",
            taskType: "subagent",
            title: "recovered subagent",
            details: {
              subagent: {
                runId,
                mode: "fresh",
                taskChannelId: `task-${runId}`,
                contextId: `ctx-${runId}`,
                parentContextId: "ctx-1",
                childEntityId: `do:workers/agent-worker:AiChatWorker:subagent-${runId}`,
                ...(options.includeChildParticipantId === false
                  ? {}
                  : { childParticipantId: "participant-child" }),
                label: "recovered subagent",
              },
            },
          },
          createdAt: new Date().toISOString(),
        } as unknown as AgenticEvent,
        senderId: AGENT_ID,
        ts: Date.now(),
      },
    ]);
  }

  insertSubagentRunForTest(row: {
    runId: string;
    status: "starting" | "running" | "completed";
    lastActivityAt?: number;
  }) {
    const now = Date.now();
    this.subagentRuns.insert({
      runId: row.runId,
      nativeTaskId: this.subagentRuns.listAll().length + 1,
      taskChannelId: `task-${row.runId}`,
      parentContextId: "ctx-1",
      childContextId: `ctx-${row.runId}-stale`,
      childEntityId: `do:workers/agent-worker:AiChatWorker:subagent-${row.runId}`,
      childParticipantId: "participant-child",
      parentChannelId: CHANNEL,
      mode: "fresh",
      label: "stale subagent",
      depth: 1,
      status: row.status,
      sourceEventId: null,
      semanticIntegrationSnapshot: null,
      startedAt: now,
      lastActivityAt: row.lastActivityAt ?? now,
      launchConfig: null,
    });
  }

  async inspectSubagentForTest(
    runId: string,
    query: string,
    parentChannelId = CHANNEL,
  ) {
    return this.inspectSubagent(runId, query, parentChannelId);
  }

  async mergeSubagentForTest(
    runId: string,
    parentChannelId = CHANNEL,
    intent?: string,
  ) {
    return this.mergeSubagent(runId, parentChannelId, [], intent);
  }

  respondToVcs(method: string, ...responses: unknown[]) {
    this.vcsResponses.set(`vcs.${method}`, [...responses]);
  }

  async readSubagentForTest(
    runId: string,
    afterSeq: number,
    parentChannelId = CHANNEL,
  ) {
    return this.readSubagent(runId, afterSeq, parentChannelId);
  }

  async sendToSubagentForTest(
    runId: string,
    message: string,
    parentChannelId = CHANNEL,
  ) {
    return this.sendToSubagent("send-test", runId, message, parentChannelId);
  }

  systemPromptForTest(channelId = CHANNEL) {
    return this.composePrompt(channelId);
  }

  setSubagentSourceForTest(runId: string, sourceEventId: string) {
    this.subagentRuns.setSourceEventId(runId, sourceEventId);
  }
}
async function makeSubagentSpawnProbe(
  config?: unknown,
): Promise<SubagentSpawnProbe> {
  const { instance, db } = await createTestDO(
    SubagentSpawnProbe,
    TEST_AGENT_ENV,
  );
  await instance.registerSubscriptionForTest(CHANNEL, config);
  databases.push(db);
  return instance;
}
function semanticStatus(
  contextId: string,
  committedEventId: string,
  workingHead:
    | { kind: "event"; eventId: string }
    | { kind: "application"; applicationId: string },
  clean: boolean,
  integrating: VcsStatusResult["integrating"] = [],
) {
  return {
    contextId,
    committed: { kind: "event" as const, eventId: committedEventId },
    workingHead,
    clean,
    mainEventId: "event:main",
    mainRelation: "ahead" as const,
    workingCounts: {
      applications: clean ? 0 : 1,
      workUnits: clean ? 0 : 1,
      changes: clean ? 0 : 1,
    },
    integrating,
  };
}
function semanticComparison(
  target:
    | { kind: "event"; eventId: string }
    | { kind: "application"; applicationId: string },
  sourceEventId: string,
  coordinates: Array<{ id: string; status: "adopt" | "conflict" }>,
  concluded = coordinates.length === 0,
): VcsCompareResult {
  const conflict = coordinates.filter(
    (coordinate) => coordinate.status === "conflict",
  ).length;
  const adopt = coordinates.length - conflict;
  return {
    target,
    source: { kind: "event" as const, eventId: sourceEventId },
    base: { kind: "event" as const, eventId: "event:base" },
    resolution: {
      complete: coordinates.length === 0,
      remainingCoordinateCount: coordinates.length,
      concluded,
    },
    counts: { adopt, convergent: 0, composed: 0, conflict, resolved: 0 },
    intentCounts: {
      merged: 0,
      settled: 0,
      split: 0,
      contested: conflict,
      pending: adopt,
    },
    coordinates: coordinates.map((entry) => ({
      coordinate: {
        kind: "file" as const,
        id: entry.id,
        paths: { theirs: `${entry.id}.ts` },
      },
      status: entry.status,
      aspects: [
        {
          aspect: "content" as const,
          base: null,
          ours: null,
          theirs: entry.id,
          status: entry.status,
        },
      ],
      attribution: {
        ours: [],
        theirs: [
          { changeId: `change:${entry.id}`, workUnitId: `work:${entry.id}` },
        ],
      },
      resolutions: ["theirs", "ours", "current"],
      summary: entry.id,
    })),
    intents: [],
    intentsTruncated: false,
    nextCursor: null,
  };
}
describe("AgentVesselBase retained subagent resources", () => {
  it.each(["runtime", "worker", "build"])(
    "rejects an unknown inspection query as an invalid reference: %s",
    async (query) => {
      const probe = await makeSubagentSpawnProbe();
      probe.insertSubagentRunForTest({
        runId: "inv-invalid-query",
        status: "running",
      });
      await expect(
        probe.inspectSubagentForTest("inv-invalid-query", query),
      ).rejects.toMatchObject({
        code: "InvalidReference",
        errorData: { referenceKind: "child-file-path", query },
      });
      expect(
        probe.rpcCalls.filter(({ method }) => method.startsWith("vcs.")),
      ).toEqual([]);
    },
  );

  it("returns a bounded parent-relative diff instead of expanding the child semantic graph", async () => {
    const probe = await makeSubagentSpawnProbe();
    const runId = "inv-diff";
    probe.insertSubagentRunForTest({ runId, status: "running" });
    const childHead = { kind: "event" as const, eventId: "event:child" };
    const parentHead = {
      kind: "application" as const,
      applicationId: "application:parent",
    };
    probe.respondToVcs(
      "status",
      semanticStatus("ctx-inv-diff-stale", "event:child", childHead, true),
      semanticStatus("ctx-1", "event:parent", parentHead, false),
    );
    probe.respondToVcs(
      "compare",
      semanticComparison(parentHead, "event:child", [
        { id: "child", status: "adopt" },
      ]),
    );

    const out = await probe.inspectSubagentForTest(runId, "diff");
    const text =
      (out.content?.[0] as { text?: string } | undefined)?.text ?? "";

    expect(text).toContain("Source event:child: 1 adopt");
    expect(text).toContain("Coordinate: file:child · adopt · child");
    expect(text).toContain("Child source is committed and clean");
    expect(text.length).toBeLessThan(20_000);
    expect(
      probe.rpcCalls.filter(({ method }) => method.startsWith("vcs.")),
    ).toEqual([
      {
        target: "main",
        method: "vcs.status",
        args: [{ contextId: "ctx-inv-diff-stale" }],
      },
      {
        target: "main",
        method: "vcs.status",
        args: [{ contextId: "ctx-1" }],
      },
      {
        target: "main",
        method: "vcs.compare",
        args: [
          {
            target: parentHead,
            source: childHead,
            limit: 20,
          },
        ],
      },
    ]);
    expect(probe.rpcCalls.some(({ method }) => method === "vcs.inspect")).toBe(
      false,
    );
  });

  it("compares the child's current working state when it has uncommitted edits", async () => {
    const probe = await makeSubagentSpawnProbe();
    const runId = "inv-dirty-diff";
    probe.insertSubagentRunForTest({ runId, status: "completed" });
    const childWorkingHead = {
      kind: "application" as const,
      applicationId: "application:child-working",
    };
    const parentHead = {
      kind: "application" as const,
      applicationId: "application:parent",
    };
    probe.respondToVcs(
      "status",
      semanticStatus(
        "ctx-inv-dirty-diff",
        "event:child-commit",
        childWorkingHead,
        false,
      ),
      semanticStatus("ctx-1", "event:parent", parentHead, false),
    );
    probe.respondToVcs(
      "compare",
      semanticComparison(parentHead, "application:child-working", [
        { id: "dirty-child", status: "adopt" },
      ]),
    );

    const out = await probe.inspectSubagentForTest(runId, "diff");
    expect(out.content?.[0]).toMatchObject({
      text: expect.stringContaining(
        "comparison includes its current working state",
      ),
    });
    expect(probe.rpcCalls).toContainEqual({
      target: "main",
      method: "vcs.compare",
      args: [{ target: parentHead, source: childWorkingHead, limit: 20 }],
    });
  });

  it("pages child log history from the committed event when the working head is an application", async () => {
    const probe = await makeSubagentSpawnProbe();
    const runId = "inv-log";
    probe.insertSubagentRunForTest({ runId, status: "running" });
    const committed = { kind: "event" as const, eventId: "event:child-commit" };
    const workingHead = {
      kind: "application" as const,
      applicationId: "application:child-working",
    };
    probe.respondToVcs(
      "status",
      semanticStatus(
        "ctx-inv-log-stale",
        committed.eventId,
        workingHead,
        false,
      ),
    );
    probe.respondToVcs("history", {
      root: committed,
      entries: [
        { node: committed, createdAt: null, summary: "Child fixture commit" },
      ],
      nextCursor: null,
    });

    const out = await probe.inspectSubagentForTest(runId, "log");

    expect((out.content?.[0] as { text?: string } | undefined)?.text).toContain(
      "Child fixture commit",
    );
    expect(
      probe.rpcCalls.filter(({ method }) => method.startsWith("vcs.")),
    ).toEqual([
      {
        target: "main",
        method: "vcs.status",
        args: [{ contextId: "ctx-inv-log-stale" }],
      },
      {
        target: "main",
        method: "vcs.history",
        args: [{ root: committed, direction: "past", limit: 20 }],
      },
    ]);
  });

  it("adopts a committed child's applicable changes into the local working chain", async () => {
    const probe = await makeSubagentSpawnProbe();
    const runId = "inv-semantic";
    probe.insertSubagentRunForTest({ runId, status: "running" });
    const target = {
      kind: "application" as const,
      applicationId: "application:target",
    };
    const integrated = {
      kind: "application" as const,
      applicationId: "application:integrated",
    };
    const sourceEventId = "event:source";
    const integration = {
      contextId: "ctx-1",
      workUnitId: "work:integration",
      applicationId: integrated.applicationId,
      changeIds: [],
      incorporatedChangeIds: ["change:1"],
      workingHead: integrated,
      decisionId: "decision:1",
    };

    probe.respondToVcs(
      "status",
      semanticStatus("ctx-1", "event:parent", target, false),
      semanticStatus(
        "ctx-child",
        sourceEventId,
        { kind: "event", eventId: sourceEventId },
        true,
      ),
    );
    const initialComparison = semanticComparison(target, sourceEventId, [
      { id: "one", status: "adopt" },
    ]);
    initialComparison.intents = [
      {
        workUnitId: "work:child",
        side: "theirs",
        state: "pending",
        intent: {
          tier: "trigger",
          text: "asked by user:owner: Build the fixture corpus",
        },
        coordinates: [{ kind: "file", id: "one" }],
      },
    ];
    probe.respondToVcs(
      "compare",
      initialComparison,
      semanticComparison(integrated, sourceEventId, []),
    );
    probe.respondToVcs("merge", {
      ...integration,
      status: "working",
      commandId: "command:integration",
      changeCount: 0,
      incorporatedChangeCount: 1,
      decisionIds: ["decision:1"],
      outcomes: [],
      resolution: {
        complete: true,
        remainingCoordinateCount: 0,
        concluded: true,
      },
      intents: initialComparison.intents,
      intentsTruncated: false,
      counts: {
        adopt: 0,
        convergent: 0,
        composed: 0,
        conflict: 0,
        resolved: 1,
      },
      conflicts: [],
      nextConflictCursor: null,
      composed: [
        {
          coordinate: { kind: "file", id: "one" },
          ours: { tier: "mechanical", text: "Keep the parent index" },
          theirs: { tier: "trigger", text: "Build the fixture corpus" },
        },
      ],
    });

    const result = await probe.mergeSubagentForTest(
      runId,
      CHANNEL,
      "Integrate the reviewed fixture corpus",
    );

    expect(result.details).toMatchObject({
      protocol: "vibestudio.subagent-merge.v1",
      runId,
      status: "working",
      sourceEventId,
      initialWorkingHead: target,
      workingHead: integrated,
      merges: [expect.objectContaining({ decisionId: "decision:1" })],
      review: expect.objectContaining({
        sourceHeadline: "asked by user:owner: Build the fixture corpus",
      }),
    });
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringMatching(
        /Resolution: complete=true; concluded=true; remaining=0[\s\S]*Source: asked by user:owner[\s\S]*Composed: file:one/,
      ),
    });
    expect(probe.subagentRunForTest(runId)?.sourceEventId).toBe(sourceEventId);
    const vcsCalls = probe.rpcCalls.filter(
      ({ target: callTarget, method }) =>
        callTarget === "main" && method.startsWith("vcs."),
    );
    expect(vcsCalls.map(({ method }) => method)).toEqual([
      "vcs.status",
      "vcs.status",
      "vcs.merge",
    ]);
    const integrateInput = vcsCalls.find(({ method }) => method === "vcs.merge")
      ?.args[0] as Record<string, unknown>;
    expect(integrateInput).toMatchObject({
      contextId: "ctx-1",
      expectedWorkingHead: target,
      source: { kind: "event", eventId: sourceEventId },
      intentSummary: "Integrate the reviewed fixture corpus",
    });
    expect(integrateInput["commandId"]).toMatch(
      /^subagent-merge:[a-f0-9]{64}$/,
    );
    expect(vcsCalls.some(({ method }) => method === "vcs.commit")).toBe(false);
  });

  it("treats an already-accounted child event as unchanged without a recovery subsystem", async () => {
    const probe = await makeSubagentSpawnProbe();
    const runId = "inv-retry";
    probe.insertSubagentRunForTest({ runId, status: "running" });
    const target = {
      kind: "application" as const,
      applicationId: "application:target",
    };
    const sourceEventId = "event:source";
    probe.respondToVcs(
      "status",
      semanticStatus("ctx-1", "event:parent", target, false),
      semanticStatus(
        "ctx-child",
        sourceEventId,
        { kind: "event", eventId: sourceEventId },
        true,
      ),
    );
    probe.respondToVcs("merge", {
      status: "unchanged",
      contextId: "ctx-1",
      workingHead: target,
      resolution: {
        complete: true,
        remainingCoordinateCount: 0,
        concluded: true,
      },
      counts: {
        adopt: 0,
        convergent: 0,
        composed: 0,
        conflict: 0,
        resolved: 1,
      },
      intents: [],
      intentsTruncated: false,
      conflicts: [],
      nextConflictCursor: null,
    });

    const result = await probe.mergeSubagentForTest(runId);

    expect(result.details).toMatchObject({
      status: "unchanged",
      sourceEventId,
      initialWorkingHead: target,
      workingHead: target,
      merges: [expect.objectContaining({ status: "unchanged" })],
    });
    expect(probe.subagentRunForTest(runId)?.sourceEventId).toBe(sourceEventId);
    const methods = probe.rpcCalls.map(({ method }) => method);
    expect(methods.filter((method) => method === "vcs.merge")).toHaveLength(1);
    expect(methods).not.toContain("vcs.commit");

    expect(probe.subagentRunForTest(runId)).toMatchObject({
      status: "running",
      semanticIntegrationSnapshot: expect.objectContaining({
        state: "complete",
        asOfWorkingHead: target,
      }),
    });
  });

  it("returns the engine's bounded conflict page without a wrapper compare", async () => {
    const probe = await makeSubagentSpawnProbe();
    const runId = "inv-paged-conflict";
    probe.insertSubagentRunForTest({ runId, status: "running" });
    const target = {
      kind: "application" as const,
      applicationId: "application:target",
    };
    const sourceEventId = "event:source";
    probe.respondToVcs(
      "status",
      semanticStatus("ctx-1", "event:parent", target, false),
      semanticStatus(
        "ctx-child",
        sourceEventId,
        { kind: "event", eventId: sourceEventId },
        true,
      ),
    );
    const latePage = semanticComparison(
      target,
      sourceEventId,
      [{ id: "late-conflict", status: "conflict" }],
      true,
    );
    probe.respondToVcs("merge", {
      status: "unchanged",
      contextId: "ctx-1",
      workingHead: target,
      resolution: {
        complete: false,
        remainingCoordinateCount: 1,
        concluded: true,
      },
      counts: latePage.counts,
      intents: [],
      intentsTruncated: false,
      conflicts: latePage.coordinates,
      nextConflictCursor: "cursor:late-conflict",
    });

    const result = await probe.mergeSubagentForTest(runId);

    expect(result.details).toMatchObject({
      status: "needs-decision",
      review: expect.objectContaining({
        conflicts: [
          expect.objectContaining({
            coordinate: expect.objectContaining({ id: "late-conflict" }),
          }),
        ],
      }),
    });
    expect(
      probe.rpcCalls.filter(({ method }) => method === "vcs.compare"),
    ).toHaveLength(0);
    expect(
      probe.rpcCalls.filter(({ method }) => method === "vcs.merge"),
    ).toHaveLength(1);
  });

  it("keeps adopted changes local and reports remaining conflicting changes", async () => {
    const probe = await makeSubagentSpawnProbe();
    const runId = "inv-conflict";
    probe.insertSubagentRunForTest({ runId, status: "running" });
    const target = {
      kind: "application" as const,
      applicationId: "application:target",
    };
    const integrated = {
      kind: "application" as const,
      applicationId: "application:partial",
    };
    const sourceEventId = "event:source";
    const conflicting = { id: "conflicting", status: "conflict" as const };
    probe.respondToVcs(
      "status",
      semanticStatus("ctx-1", "event:parent", target, false),
      semanticStatus(
        "ctx-child",
        sourceEventId,
        { kind: "event", eventId: sourceEventId },
        true,
      ),
    );
    probe.respondToVcs(
      "compare",
      semanticComparison(target, sourceEventId, [
        { id: "applicable", status: "adopt" },
        conflicting,
      ]),
      semanticComparison(integrated, sourceEventId, [conflicting], true),
    );
    probe.respondToVcs("merge", {
      status: "working",
      commandId: "command:partial",
      contextId: "ctx-1",
      workUnitId: "work:partial",
      applicationId: integrated.applicationId,
      changeCount: 0,
      changeIds: [],
      incorporatedChangeCount: 1,
      incorporatedChangeIds: ["change:applicable"],
      decisionIds: ["decision:partial"],
      workingHead: integrated,
      decisionId: "decision:partial",
      outcomes: [],
      resolution: {
        complete: false,
        remainingCoordinateCount: 1,
        concluded: true,
      },
      intents: [],
      intentsTruncated: false,
      counts: {
        adopt: 0,
        convergent: 0,
        composed: 0,
        conflict: 1,
        resolved: 1,
      },
      conflicts: semanticComparison(
        integrated,
        sourceEventId,
        [conflicting],
        true,
      ).coordinates,
      nextConflictCursor: null,
      composed: [],
    });

    const result = await probe.mergeSubagentForTest(runId);

    expect(result.details).toMatchObject({
      status: "needs-decision",
      sourceEventId,
      workingHead: integrated,
      review: expect.objectContaining({
        conflicts: [
          expect.objectContaining({
            coordinate: expect.objectContaining({ id: "conflicting" }),
            status: "conflict",
          }),
        ],
      }),
    });
    expect(probe.subagentRunForTest(runId)?.sourceEventId).toBe(sourceEventId);
    const methods = probe.rpcCalls.map(({ method }) => method);
    expect(methods.filter((method) => method === "vcs.merge")).toHaveLength(1);
    expect(methods).not.toContain("vcs.commit");

    expect(probe.subagentRunForTest(runId)).not.toBeNull();
  });

  it("resolves a retained compact native task reference for read and follow-up", async () => {
    const probe = await makeSubagentSpawnProbe();
    const runId = "invocation:native:retained-child-with-long-identity";
    probe.insertSubagentRunForTest({ runId, status: "completed" });
    const run = probe.subagentRunForTest(runId)!;
    const runRef = `@s${run.nativeTaskId.toString(36)}`;
    expect((await probe.readSubagentForTest(runRef, 0)).details).toMatchObject({
      runId,
      runRef,
      empty: true,
    });
    expect(await probe.addresseeRunsForTest()).toContainEqual(
      expect.objectContaining({ runId, runRef, status: "completed" }),
    );
    await expect(
      probe.sendToSubagentForTest(runRef, "follow up"),
    ).resolves.toMatchObject({
      details: { runId, runRef, messageId: "subagent-msg:send-test" },
    });
    expect(probe.subagentRunForTest(runId)?.status).toBe("running");
  });

  it("rejects abbreviated and mistyped identities without guessing a child", async () => {
    const probe = await makeSubagentSpawnProbe();
    probe.insertSubagentRunForTest({
      runId: "call_shared_prefix_1234567890_alpha",
      status: "running",
    });
    probe.insertSubagentRunForTest({
      runId: "call_shared_prefix_1234567890_bravo",
      status: "running",
    });
    for (const reference of [
      "call_shared_prefix_1234567890_...",
      "call_shared_prefix_1234567890_alph",
      "@s01",
      "@s0",
      "@s999",
    ]) {
      await expect(probe.readSubagentForTest(reference, 0)).rejects.toThrow(
        "unknown subagent run",
      );
    }
  });

  it("does not project supervised-run or VCS state into the system prompt", async () => {
    const probe = await makeSubagentSpawnProbe();
    const runId = "inv-prompt-integration";
    const sourceEventId = "event:child-source";
    probe.insertSubagentRunForTest({ runId, status: "running" });
    probe.setSubagentSourceForTest(runId, sourceEventId);
    probe.respondToVcs(
      "status",
      semanticStatus(
        "ctx-1",
        "event:parent",
        { kind: "application", applicationId: "application:parent" },
        false,
        [
          {
            source: { kind: "event", eventId: sourceEventId },
            remainingCoordinateCount: 3,
            mergeableCoordinateCount: 0,
            conflictCoordinateCount: 3,
            concluded: true,
            asOfWorkingHead: {
              kind: "application",
              applicationId: "application:parent",
            },
            stale: false,
          },
        ],
      ),
    );

    const prompt = await probe.systemPromptForTest();

    expect(prompt).not.toContain("Durable Supervised Subagent Ledger");
    expect(prompt).not.toContain("semanticIntegration");
    expect(probe.rpcCalls).toEqual([]);
  });

  it("admits retained supervisor follow-up only on the child's owned task channel", async () => {
    const child = await makeSubagentSpawnProbe();
    child.subagentIdentityForTest = {
      runId: "inv-1",
      task: "task",
      parentRef: "parent",
      parentChannelId: CHANNEL,
      taskChannelId: "task-inv-1",
      parentContextId: "ctx-1",
      depth: 1,
      parentParticipantId: "parent",
    };
    const event: ChannelEvent = {
      id: 192,
      messageId: "follow-up",
      type: AGENTIC_EVENT_PAYLOAD_KIND,
      senderId: "parent",
      ts: Date.now(),
      annotations: { agentHops: 6 },
      payload: {
        kind: "message.completed",
        actor: { kind: "agent", id: "parent" },
        causality: { messageId: "follow-up" },
        payload: {
          role: "assistant",
          blocks: [],
          outcome: "completed",
          to: [{ kind: "participant", participantId: AGENT_ID }],
        },
      },
    };
    await expect(
      child.acceptsMessageForTest("task-inv-1", event),
    ).resolves.toBe(true);
    await expect(child.acceptsMessageForTest(CHANNEL, event)).resolves.toBe(
      false,
    );
    await expect(
      child.acceptsMessageForTest("task-inv-1", { ...event, senderId: "peer" }),
    ).resolves.toBe(false);
  });
});

describe("AgentVesselBase native intake decisions", () => {
  it("preserves exact UI selection fields in the admitted model input without exposing transport metadata", async () => {
    const vessel = await makePromptProbe();
    const interaction = {
      source: "onboarding-setup-hub",
      kind: "onboarding-capability",
      action: "setup",
      targetId: "connection.calendar",
    };
    const event = {
      ...customChannelEvent(AGENTIC_EVENT_PAYLOAD_KIND),
      payload: {
        kind: "message.completed",
        actor: { kind: "user", id: "user" },
        causality: { messageId: "selected-calendar" },
        payload: {
          blocks: [{ type: "text", content: "Use the selected setup action." }],
          metadata: {
            interaction: { ...interaction, privateField: "must-not-render" },
            automation: { authoritySessionNonce: "must-not-render" },
            deliverAfterTurn: true,
          },
        },
      },
    };
    const selected = await vessel.selectForTest(CHANNEL, event);
    expect(selected.intake.kind).toBe("input");
    if (
      selected.intake.kind !== "input" ||
      typeof selected.intake.content !== "string"
    )
      throw new Error("The UI choice was not admitted as native input");
    const [text, selection] = selected.intake.content.split("\n\n");
    expect(text).toBe("Use the selected setup action.");
    expect(JSON.parse(selection!.split("\n")[1]!)).toEqual(interaction);
    expect(selected.intake.content).not.toContain("must-not-render");
    expect(selected.intake.content).not.toContain("deliverAfterTurn");
    const ordinary = await vessel.selectForTest(CHANNEL, {
      ...event,
      payload: {
        ...event.payload,
        payload: { blocks: event.payload.payload.blocks },
      },
    });
    expect(ordinary.intake).toEqual({
      kind: "input",
      content: "Use the selected setup action.",
    });
    await expect(
      vessel.selectForTest(CHANNEL, {
        ...event,
        payload: {
          ...event.payload,
          payload: {
            ...event.payload.payload,
            metadata: { interaction: { ...interaction, targetId: null } },
          },
        },
      }),
    ).rejects.toThrow("UI interaction requires");
  });

  it("keeps an unconfigured custom payload as a passive observation", async () => {
    const vessel = await makePromptProbe();
    expect(
      (
        await vessel.selectForTest(
          CHANNEL,
          customChannelEvent("application.incident.v1"),
        )
      ).intake.kind,
    ).toBe("observation");
  });
  it("selects exact configured payloads with bounded sanitized provenance", async () => {
    const vessel = await makePromptProbe({
      observations: { payloadKinds: ["application.incident.v1"] },
    });
    const payload = {
      incidentId: "inc-17",
      severity: "high",
      details: { region: "eu" },
    };
    const selected = await vessel.selectForTest(
      CHANNEL,
      customChannelEvent("application.incident.v1", { payload }),
    );
    if (
      selected.intake.kind !== "input" ||
      typeof selected.intake.content !== "string"
    )
      throw new Error("Configured observation was not selected");
    const [title, json] = selected.intake.content.split("\n\n");
    expect(title).toBe("Channel observation: application.incident.v1");
    expect(JSON.parse(json!)).toEqual({
      kind: "channel-observation",
      version: 1,
      source: {
        channelId: CHANNEL,
        envelopeId: "custom-envelope-17",
        sequence: 17,
        payloadKind: "application.incident.v1",
        timestamp: 1_786_400_000_000,
        sender: {
          kind: "external",
          id: "app:incident-feed",
          participantId: "app:incident-feed",
          displayName: "Incident feed",
          metadata: { type: "app", name: "Incident feed", handle: "incidents" },
        },
      },
      payload,
    });
    expect(selected.intake.content).not.toContain("privateCredential");
  });
  it.each(["application.incident.v1.updated", "unrelated"])(
    "requires exact configured kind: %s",
    async (type) => {
      const vessel = await makePromptProbe({
        observations: { payloadKinds: ["application.incident.v1"] },
      });
      expect(
        (await vessel.selectForTest(CHANNEL, customChannelEvent(type))).intake
          .kind,
      ).toBe("observation");
    },
  );
  it("keeps self-authored configured payloads passive", async () => {
    const vessel = await makePromptProbe({
      observations: { payloadKinds: ["application.incident.v1"] },
    });
    expect(
      (
        await vessel.selectForTest(
          CHANNEL,
          customChannelEvent("application.incident.v1", { senderId: AGENT_ID }),
        )
      ).intake.kind,
    ).toBe("observation");
  });
  it("replaces oversized payloads with a canonical bounded preview", async () => {
    const vessel = await makePromptProbe({
      observations: { payloadKinds: ["application.incident.v1"] },
    });
    const payload = { details: "x".repeat(40_000) };
    const selected = await vessel.selectForTest(
      CHANNEL,
      customChannelEvent("application.incident.v1", { payload }),
    );
    if (
      selected.intake.kind !== "input" ||
      typeof selected.intake.content !== "string"
    )
      throw new Error("Observation not selected");
    expect(JSON.parse(selected.intake.content.split("\n\n")[1]!)).toMatchObject(
      {
        payload: null,
        truncated: {
          originalChars: JSON.stringify(payload).length,
          preview: JSON.stringify(payload).slice(0, 8192),
        },
      },
    );
  });
  it.each(["manual", "explicit"])(
    "suppresses configured input for %s wake policy",
    async (wakePolicy) => {
      const vessel = await makePromptProbe({
        wakePolicy,
        observations: { payloadKinds: ["application.incident.v1"] },
      });
      expect(
        (
          await vessel.selectForTest(
            CHANNEL,
            customChannelEvent("application.incident.v1"),
          )
        ).intake.kind,
      ).toBe("observation");
    },
  );
  it("keeps agentic infrastructure passive", async () => {
    const vessel = await makePromptProbe({
      observations: { payloadKinds: [AGENTIC_EVENT_PAYLOAD_KIND] },
    });
    const selected = await vessel.selectForTest(CHANNEL, {
      ...customChannelEvent(AGENTIC_EVENT_PAYLOAD_KIND),
      payload: {
        kind: "system.event",
        actor: { kind: "system", id: "system" },
        payload: { protocol: AGENTIC_PROTOCOL_VERSION },
        createdAt: new Date().toISOString(),
      },
    });
    expect(selected.intake.kind).toBe("observation");
  });
  it("gives the subclass hook first refusal", async () => {
    const vessel = await makePromptProbe({
      observations: { payloadKinds: ["application.incident.v1"] },
    });
    vessel.consumePayloadKind = "application.incident.v1";
    expect(
      (
        await vessel.selectForTest(
          CHANNEL,
          customChannelEvent("application.incident.v1"),
        )
      ).intake.kind,
    ).toBe("observation");
  });
  it("refuses to infer an input from a message without canonical source identity", async () => {
    const vessel = await makePromptProbe();
    const event = {
      ...customChannelEvent(AGENTIC_EVENT_PAYLOAD_KIND),
      payload: {
        kind: "message.completed",
        actor: { kind: "user", id: "user" },
        payload: { blocks: [{ type: "text", content: "hello" }] },
      },
    };
    await expect(vessel.selectForTest(CHANNEL, event)).rejects.toThrow(
      "canonical source message identity",
    );
  });
});
