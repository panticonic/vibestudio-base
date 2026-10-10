import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  Type,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  bindReceipt,
  createRegistry,
  defineExtension,
  defineTool,
  DirectToolCallEntry,
  Harness,
  MemoryStorage,
  type ModelRequestPort,
  type TaskId,
  type Storage,
  type ToolExecutionApi,
  UserEntry,
} from "@panticonic/pi-durable";
import { openNodeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";
import {
  nativeInvocationId,
  type NativeInvocationSource,
} from "@vibestudio/service-schemas/nativeInvocation";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { createMainRpcCaller } from "@vibestudio/service-schemas/mainRpc";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import {
  openNativeChannelConversation,
  submitNativeChannelDelivery,
  prepareNativeChannelReadReceipts,
  type NativeChannelDelivery,
} from "./native-channel-session.js";
import {
  prepareNativeProductContexts,
  recordNativeProductInput,
} from "./native-product-context.js";
import {
  openPlatformAgentSession,
  type AgentHostCall,
} from "./native-agent-session.js";
import {
  inspectNativeInvocationSource,
  retainNativeModelInvocation,
  retainNativeToolInvocation,
} from "./native-invocation-source.js";

const context = BACKGROUND_CONTEXT;
const owner = {
  runtimeId: "do:workers/agent:Agent:one",
  authoritySessionId: "lifetime:one",
  contextId: "context:one",
  incarnation: "storage:one",
};
const image = {
  runtimeId: owner.runtimeId,
  source: "workers/agent",
  className: "Agent",
  objectKey: "one",
  executionDigest: "a".repeat(64),
};
const entity = {
  id: owner.runtimeId,
  authoritySessionId: owner.authoritySessionId,
  kind: "do",
  status: "active",
  source: { repoPath: image.source, effectiveVersion: "state:one" },
  contextId: owner.contextId,
  className: image.className,
  key: image.objectKey,
  activeExecutionDigest: image.executionDigest,
  agentBinding: {
    entityId: owner.runtimeId,
    contextId: owner.contextId,
    channelId: "channel:one",
  },
  createdAt: 1,
  cleanupComplete: false,
};
const hostMethods: string[] = [];
function hostCaller(activeEntity: typeof entity = entity): AgentHostCall {
  return createMainRpcCaller(
    schemaRpcMock({
      call: async (_target: string, method: string) => {
        hostMethods.push(method);
        if (method === "workspace-state.alarmSourceRegister") return { incarnation: owner.incarnation, entity: JSON.parse(JSON.stringify(activeEntity)) };
        if (method === "workspace-state.alarmSourcePublish") return "accepted";
        throw new Error(`Unexpected main RPC ${method}`);
      },
    }),
  );
}
const call = hostCaller();
const sessions: Harness[] = [];
afterEach(async () => {
  await Promise.all(
    sessions.splice(0).map((harness) => harness.close(context)),
  );
});

function setup() {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const registry = createRegistry();
  return { faux, models, registry };
}

async function open(
  state: ReturnType<typeof setup>,
  modelRequests?: ModelRequestPort,
  storage: Storage = new MemoryStorage(),
  executable = image,
  activeCall = call,
) {
  const harness = await openPlatformAgentSession(
    async () => storage,
    executable,
    activeCall,
    {
      models: state.models,
      registry: state.registry,
      ...(modelRequests ? { modelRequests } : {}),
    },
    context,
  );
  sessions.push(harness);
  const root = await openNativeChannelConversation(harness, { channelId: "channel:one", contextId: owner.contextId }, { model: { provider: "faux", modelId: state.faux.getModel().id } }, context);
  return { harness, root };
}

function originDelivery(
  id: string,
  sequence: number,
  messageId: string,
): NativeChannelDelivery {
  return {
    deliveryId: id,
    channelId: "channel:one",
    channelRef: {
      source: "workers/channel",
      className: "ChannelDO",
      objectKey: "channel:one",
    },
    participantId: owner.runtimeId,
    subscriptionRevision: 1,
    eventSequence: sequence,
    envelope: {
      kind: "log",
      event: {
        id: sequence,
        messageId: `outer:${id}`,
        senderId: "user:original",
        type: "agentic.trajectory.v1/event",
        payload: {
          kind: "message.completed",
          actor: {
            kind: "user",
            id: "original",
            participantId: "user:original",
          },
          causality: { messageId },
          payload: {
            protocol: "agentic.trajectory.v1",
            role: "user",
            blocks: [
              { type: "text", blockId: `block:${id}`, content: "actual input" },
            ],
            outcome: "completed",
          },
          createdAt: "2026-10-02T00:00:00.000Z",
        },
      },
    },
    agenticContext: {
      version: 1,
      relationships: [],
      channelConfig: {},
      conversation: {
        lastCompletedSender: "user:original",
        lastCompletedMessageId: messageId,
        lastCompletedSeq: sequence,
        previousCompletedSender: null,
        previousCompletedMessageId: null,
        previousCompletedSeq: null,
        agentStreak: 0,
      },
      replyToSenderId: null,
    },
  };
}

describe("native invocation source", () => {
  it("proves only the original placed mailbox input through model and genuine ToolTask ancestry despite history and later steering", async () => {
    const state = setup();
    let harness!: Harness;
    let source!: NativeInvocationSource;
    let ready = false;
    const expected: unknown[] = [];
    const tool = defineTool({
      name: "origin",
      description: "origin",
      parameters: Type.Object({}),
      replay: "safe",
      execute: async (_args, api, ctx) => {
        const actual = await retainNativeToolInvocation(
          harness,
          api,
          image,
          ctx,
        );
        const inspected = await inspectNativeInvocationSource(
          harness,
          { taskId: api.taskId, invocationId: nativeInvocationId(actual) },
          image,
          ctx,
        );
        expected.push(inspected?.originatingInput);
        return { content: [{ type: "text", text: "ok" }] };
      },
    });
    state.registry.install(defineExtension({ name: "origin", tools: [tool] }));
    harness = await openPlatformAgentSession(
      async () => new MemoryStorage(),
      image,
      call,
      {
        models: state.models,
        registry: state.registry,
          prepareCommit: async (tx, staged) => {
          await prepareNativeChannelReadReceipts(
            tx,
            staged.submissions,
            async () => {},
          );
          await prepareNativeProductContexts(tx, staged);
        },
        modelRequests: async (request, api, ctx) => {
          source = await retainNativeModelInvocation(
            harness,
            request,
            api,
            image,
            ctx,
          );
          return ready
            ? { status: "ready", options: {}, close: async () => {} }
            : {
                status: "waiting",
                condition: {
                  kind: "input",
                  conversationId: request.conversationId,
                  after: request.cutoff,
                  kinds: ["test.origin-ready"],
                },
              };
        },
      },
      context,
    );
    sessions.push(harness);
    const binding = { channelId: "channel:one", contextId: owner.contextId };
    const conversation = await openNativeChannelConversation(
      harness,
      binding,
      {
        model: { provider: "faux", modelId: state.faux.getModel().id },
        tools: [tool],
      },
      context,
    );
    await harness.commit(
      (tx) =>
        tx.appendEntry(UserEntry, conversation.id, {
          model: [
            {
              role: "user",
              content: "passive imported-looking history",
              timestamp: 1,
            },
          ],
        }),
      context,
    );
    const original = originDelivery("original", 17, "message:original");
    const first = await submitNativeChannelDelivery(
      harness,
      binding,
      original,
      { kind: "input", content: "actual original" },
      context,
      (tx, input) =>
        recordNativeProductInput(
          tx,
          input.submissionId,
          input.binding.channelId,
        ),
    );
    await harness.runPass(context);
    const proof = (
      await inspectNativeInvocationSource(
        harness,
        {
          taskId: source.task.taskId,
          invocationId: nativeInvocationId(source),
        },
        image,
        context,
      )
    )?.originatingInput;
    const placed = await (await harness.submission(
      first.submissionId,
      context,
    ))!.status(context);
    expect(proof).toEqual({
      conversationId: conversation.id,
      submissionId: first.submissionId,
      entryId: placed.entry,
      channelRef: original.channelRef,
      eventSequence: 17,
      envelopeId: "outer:original",
      messageId: "message:original",
      receiverParticipantId: owner.runtimeId,
    });
    await submitNativeChannelDelivery(
      harness,
      binding,
      originDelivery("steering", 18, "message:steering"),
      { kind: "input", content: "later user steering", whenBusy: "steer" },
      context,
      (tx, input) =>
        recordNativeProductInput(
          tx,
          input.submissionId,
          input.binding.channelId,
        ),
    );
    expect(
      (
        await inspectNativeInvocationSource(
          harness,
          {
            taskId: source.task.taskId,
            invocationId: nativeInvocationId(source),
          },
          image,
          context,
        )
      )?.originatingInput,
    ).toEqual(proof);
    ready = true;
    state.faux.setResponses([
      fauxAssistantMessage(
        [fauxToolCall("origin", {}, { id: "original-call" })],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("done"),
    ]);
    await harness.commit(
      (tx) => tx.appendEntry(conversation.id, { kind: "test.origin-ready" }),
      context,
    );
    expect(
      (
        await (await harness.submission(first.submissionId, context))!.wait(
          context,
        )
      ).status,
    ).toBe("done");
    expect(expected).toEqual([proof]);
  });

  it("does not replace an initiated run root with a later human mailbox input or a synthetic user entry", async () => {
    const state = setup();
    let harness!: Harness;
    let source!: NativeInvocationSource;
    harness = await openPlatformAgentSession(
      async () => new MemoryStorage(),
      image,
      call,
      {
        models: state.models,
        registry: state.registry,
          prepareCommit: async (tx, staged) => {
          await prepareNativeChannelReadReceipts(
            tx,
            staged.submissions,
            async () => {},
          );
          await prepareNativeProductContexts(tx, staged);
        },
        modelRequests: async (request, api, ctx) => {
          source = await retainNativeModelInvocation(
            harness,
            request,
            api,
            image,
            ctx,
          );
          return {
            status: "waiting",
            condition: {
              kind: "input",
              conversationId: request.conversationId,
              after: request.cutoff,
              kinds: ["never"],
            },
          };
        },
      },
      context,
    );
    sessions.push(harness);
    const binding = { channelId: "channel:one", contextId: owner.contextId };
    const conversation = await openNativeChannelConversation(
      harness,
      binding,
      { model: { provider: "faux", modelId: state.faux.getModel().id } },
      context,
    );
    await conversation.submit(
      {
        type: "input",
        content: async (tx, id) => {
          await recordNativeProductInput(tx, id, binding.channelId, {
            origin: "agent-initiated",
          });
          return "domain initiated";
        },
      },
      context,
    );
    await harness.runPass(context);
    await harness.commit(
      (tx) =>
        tx.appendEntry(UserEntry, conversation.id, {
          model: [
            { role: "user", content: "synthetic continuation", timestamp: 1 },
          ],
        }),
      context,
    );
    await submitNativeChannelDelivery(
      harness,
      binding,
      originDelivery("later", 19, "message:later"),
      { kind: "input", content: "later actual human", whenBusy: "steer" },
      context,
      (tx, input) =>
        recordNativeProductInput(
          tx,
          input.submissionId,
          input.binding.channelId,
        ),
    );
    expect(
      (
        await inspectNativeInvocationSource(
          harness,
          {
            taskId: source.task.taskId,
            invocationId: nativeInvocationId(source),
          },
          image,
          context,
        )
      )?.originatingInput,
    ).toBeNull();
  });

  it("authenticates a genuine model-free direct ToolTask source and keeps its exact identity through cancellation", async () => {
    const state = setup();
    let harness!: Harness;
    let source!: NativeInvocationSource;
    let cancelled: NativeInvocationSource | undefined;
    const tool = defineTool({
      name: "direct-eval",
      description: "Direct Eval",
      parameters: Type.Object({ text: Type.String() }),
      execute: async (_args, api, ctx) => {
        source = await retainNativeToolInvocation(
          harness,
          api,
          image,
          ctx,
        );
        expect(source.operation).toMatchObject({
          kind: "direct-tool",
          callId: "actual-direct",
          name: tool.name,
        });
        expect(
          await inspectNativeInvocationSource(
            harness,
            { taskId: api.taskId, invocationId: nativeInvocationId(source) },
            image,
            ctx,
          ),
        ).toMatchObject({ source, status: "running" });
        await api.retainContinuation(
          { runId: api.callId },
          (tx) => bindReceipt(tx, "direct", "original"),
          ctx,
        );
        return {
          wait: { kind: "receipt", key: "direct", binding: "original" },
          continuation: { runId: api.callId },
        };
      },
      cancel: async (_args, api, ctx) => {
        cancelled = await retainNativeToolInvocation(
          harness,
          api,
          image,
          ctx,
        );
        return {};
      },
    });
    state.registry.install(defineExtension({ name: "direct", tools: [tool] }));
    const opened = await open(state);
    harness = opened.harness;
    await opened.root.configure({ model: null, tools: [tool] }, context);
    const id = await opened.root.invokeTool(
      { id: "actual-direct", name: tool.name, arguments: { text: "actual" } },
      context,
    );
    await harness.runPass(context);
    const entries = await opened.root.entries({}, 100, undefined, context);
    expect(entries.items.filter(DirectToolCallEntry.is)).toHaveLength(1);
    expect(entries.items.every((entry) => entry.model === undefined)).toBe(
      true,
    );
    expect(state.faux.state.callCount).toBe(0);
    await opened.root.abort(context);
    expect(cancelled).toEqual(source);
    expect((await harness.getTask(id, context))?.state).toMatchObject({
      status: "terminal",
      outcome: { status: "aborted" },
    });
    expect(
      await inspectNativeInvocationSource(
        harness,
        { taskId: id, invocationId: nativeInvocationId(source) },
        image,
        context,
      ),
    ).toBeNull();
  });
  it("reopens actual pending work under a new executable image while preserving its original task attribution", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-source-"));
    const state = setup();
    let harness!: Harness;
    let source!: NativeInvocationSource;
    let ready = false;
    const sources: NativeInvocationSource[] = [];
    let executable = image;
    let activeCall = call;
    const port: ModelRequestPort = async (request, api, ctx) => {
      source = await retainNativeModelInvocation(
        harness,
        request,
        api,
        executable,
        ctx,
      );
      sources.push(source);
      return ready
        ? { status: "ready", options: {}, close: async () => {} }
        : {
            status: "waiting",
            condition: {
              kind: "input",
              conversationId: request.conversationId,
              after: request.cutoff,
              kinds: ["test.source-ready"],
            },
          };
    };
    let unsubscribe = () => {};
    try {
      let opened = await open(
        state,
        port,
        await openNodeSqliteStorage(join(directory, "owner.sqlite")),
      );
      harness = opened.harness;
      const waiting = new Promise<void>((resolve) => {
        unsubscribe = harness.subscribeCommits((publication) => {
          if (
            publication.changes.some(
              (change) =>
                change.type === "task" &&
                change.value.id === source?.task.taskId &&
                change.value.state.status === "waiting",
            )
          )
            resolve();
        });
      });
      const submission = await opened.root.submit(
        { type: "input", content: "exact original prompt" },
        context,
      );
      await waiting;
      unsubscribe();
      const original = source;
      await harness.close(context);
      executable = { ...image, executionDigest: "c".repeat(64) };
      activeCall = hostCaller({ ...entity, activeExecutionDigest: executable.executionDigest, source: { ...entity.source, effectiveVersion: "state:replacement" } });
      opened = await open(
        state,
        port,
        await openNodeSqliteStorage(join(directory, "owner.sqlite")),
        executable,
        activeCall,
      );
      harness = opened.harness;
      expect(
        await inspectNativeInvocationSource(
          harness,
          {
            taskId: original.task.taskId,
            invocationId: nativeInvocationId(original),
          },
          executable,
          context,
        ),
      ).toEqual({
        source: original,
        executor: { ...original.owner, executionDigest: executable.executionDigest, effectiveVersion: "state:replacement" },
        status: "waiting",
        abortRequested: false,
        originatingInput: null,
      });
      expect(sources).toHaveLength(1);
      ready = true;
      state.faux.setResponses([fauxAssistantMessage("done")]);
      await harness.commit(
        (tx) => tx.appendEntry(opened.root.id, { kind: "test.source-ready" }),
        context,
      );
      expect(
        (
          await (await harness.submission(submission.id, context))!.wait(
            context,
          )
        ).status,
      ).toBe("done");
      expect(sources).toEqual([original, original]);
      expect(
        await inspectNativeInvocationSource(
          harness,
          {
            taskId: original.task.taskId,
            invocationId: nativeInvocationId(original),
          },
          executable,
          context,
        ),
      ).toBeNull();
    } finally {
      unsubscribe();
      if (harness) await harness.close(context);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("records authentic scheduler model identity, is exactly replayable, and rejects changed original intent", async () => {
    const state = setup();
    let harness!: Harness;
    let source!: NativeInvocationSource;
    state.faux.setResponses([fauxAssistantMessage("done")]);
    const opened = await open(state, async (request, api, ctx) => {
      source = await retainNativeModelInvocation(
        harness,
        request,
        api,
        image,
        ctx,
      );
      expect(source.task).toEqual({
        taskId: request.taskId,
        conversationId: request.conversationId,
        kind: request.taskKind,
        version: request.taskVersion,
      });
      expect(
        await retainNativeModelInvocation(
          harness,
          request,
          api,
          image,
          ctx,
        ),
      ).toEqual(source);
      expect(
        await inspectNativeInvocationSource(
          harness,
          { taskId: request.taskId, invocationId: nativeInvocationId(source) },
          image,
          ctx,
        ),
      ).toMatchObject({ source, status: "running", abortRequested: false });
      await expect(
        retainNativeModelInvocation(
          harness,
          { ...request, messages: [] },
          api,
          image,
          ctx,
        ),
      ).rejects.toThrow("conflicts with its immutable source");
      return { status: "ready", options: {}, close: async () => {} };
    });
    harness = opened.harness;
    expect(
      (
        await (
          await opened.root.submit({ type: "input", content: "go" }, context)
        ).wait(context)
      ).status,
    ).toBe("done");
    expect(
      await inspectNativeInvocationSource(
        harness,
        {
          taskId: source.task.taskId,
          invocationId: nativeInvocationId(source),
        },
        image,
        context,
      ),
    ).toBeNull();
  });

  it("derives genuine native tool/call identity and final validated arguments from committed records", async () => {
    const state = setup();
    let harness!: Harness;
    let source!: NativeInvocationSource;
    let apiAfter!: ToolExecutionApi;
    state.registry.install(
      defineExtension({
        name: "source",
        tools: [
          defineTool({
            name: "source",
            description: "source",
            parameters: Type.Object({ text: Type.String() }),
            replay: "safe",
            prepareArguments: (args) => ({
              text: String((args as { text: string }).text).trim(),
            }),
            execute: async (_args, api, ctx) => {
              apiAfter = api;
              source = await retainNativeToolInvocation(
                harness,
                api,
                image,
                ctx,
              );
              expect(source.operation).toMatchObject({
                kind: "tool",
                callId: "actual-call",
                name: "source",
                argumentsDigest: sha256HexSyncText(
                  canonicalJson({ text: "exact" }),
                ),
              });
              expect(source.task.taskId).toBe(api.taskId);
              expect(
                await retainNativeToolInvocation(
                  harness,
                  api,
                  image,
                  ctx,
                ),
              ).toEqual(source);
              await expect(
                retainNativeToolInvocation(
                  harness,
                  { ...api, callId: "fabricated-call" },
                  image,
                  ctx,
                ),
              ).rejects.toThrow("does not match its committed invocation");
              const inspect = await inspectNativeInvocationSource(
                harness,
                {
                  taskId: api.taskId,
                  invocationId: nativeInvocationId(source),
                },
                image,
                ctx,
              );
              expect(inspect).toMatchObject({ source, status: "running" });
              return { content: [{ type: "text", text: "done" }] };
            },
          }),
        ],
      }),
    );
    state.faux.setResponses([
      fauxAssistantMessage(
        [fauxToolCall("source", { text: " exact " }, { id: "actual-call" })],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("done"),
    ]);
    const opened = await open(state);
    harness = opened.harness;
    expect(
      (
        await (
          await opened.root.submit({ type: "input", content: "go" }, context)
        ).wait(context)
      ).status,
    ).toBe("done");
    expect(
      await inspectNativeInvocationSource(
        harness,
        {
          taskId: source.task.taskId,
          invocationId: nativeInvocationId(source),
        },
        image,
        context,
      ),
    ).toBeNull();
    await expect(
      retainNativeToolInvocation(harness, apiAfter, image, context),
    ).rejects.toThrow();
  });

  it("keeps a waiting operation and cancellation cleanup causally owned until genuine native settlement", async () => {
    const state = setup();
    let harness!: Harness;
    let source!: NativeInvocationSource;
    let admitted!: () => void;
    const admission = new Promise<void>((resolve) => {
      admitted = resolve;
    });
    let cleaned = false;
    state.registry.install(
      defineExtension({
        name: "source",
        tools: [
          defineTool({
            name: "source",
            description: "source",
            parameters: Type.Object({}),
            replay: "safe",
            execute: async (_args, api, ctx) => {
              source = await retainNativeToolInvocation(
                harness,
                api,
                image,
                ctx,
              );
              await api.commit(
                (tx) => bindReceipt(tx, "operation:one", "binding:one"),
                ctx,
              );
              admitted();
              return {
                wait: {
                  kind: "receipt",
                  key: "operation:one",
                  binding: "binding:one",
                },
                continuation: { runId: "operation:one" },
              };
            },
            cancel: async (_args, api, ctx) => {
              expect(
                await retainNativeToolInvocation(
                  harness,
                  api,
                  image,
                  ctx,
                ),
              ).toEqual(source);
              expect(
                await inspectNativeInvocationSource(
                  harness,
                  {
                    taskId: api.taskId,
                    invocationId: nativeInvocationId(source),
                  },
                  image,
                  ctx,
                ),
              ).toMatchObject({ source, abortRequested: true });
              cleaned = true;
              return { content: [] };
            },
          }),
        ],
      }),
    );
    state.faux.setResponses([
      fauxAssistantMessage(
        [fauxToolCall("source", {}, { id: "actual-call" })],
        { stopReason: "toolUse" },
      ),
    ]);
    const opened = await open(state);
    harness = opened.harness;
    await opened.root.submit({ type: "input", content: "go" }, context);
    await admission;
    await harness.abortTask(source.task.taskId as TaskId, context);
    await harness.waitForTask(source.task.taskId as TaskId, context);
    expect(cleaned).toBe(true);
    expect(
      await inspectNativeInvocationSource(
        harness,
        {
          taskId: source.task.taskId,
          invocationId: nativeInvocationId(source),
        },
        image,
        context,
      ),
    ).toBeNull();
  });

  it("does not admit invented source facts on inspection and propagates the original host failure", async () => {
    const state = setup();
    const before = hostMethods.length;
    const { harness } = await open(state);
    expect(hostMethods.slice(before).filter(method => method === "workspace-state.alarmSourceRegister")).toHaveLength(1);
    expect(
      await inspectNativeInvocationSource(
        harness,
        { taskId: 999, invocationId: "fabricated" },
        image,
        context,
      ),
    ).toBeNull();
    expect(hostMethods.slice(before).filter(method => method === "workspace-state.entity.resolveActive")).toHaveLength(0);
    const original = new Error("host disconnected");
    await expect(openPlatformAgentSession(async () => new MemoryStorage(), image, async () => { throw original; }, { models: state.models, registry: state.registry }, context)).rejects.toBe(original);
    await expect(openPlatformAgentSession(async () => new MemoryStorage(), image, hostCaller({ ...entity, activeExecutionDigest: "b".repeat(64) }), { models: state.models, registry: state.registry }, context)).rejects.toThrow("active platform owner");

  });
});
