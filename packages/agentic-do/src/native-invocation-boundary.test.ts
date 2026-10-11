import { openNativeChannelConversation } from "./native-channel-session.js";
import { createNativeChannelPublication } from "./native-channel-publication.js";
import { createMainRpcCaller } from "@vibestudio/service-schemas/mainRpc";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { z } from "zod";
import { createRpcMethods } from "@vibestudio/shared/rpcMethods";
import { schemaRpcClientMock } from "@vibestudio/rpc/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  Type,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  defineExtension,
  defineTool,
  NestedCallDoc,
  MemoryStorage,
  type Harness,
  type TaskId,
} from "@panticonic/pi-durable";
import type { RpcClient, RpcCallOptions } from "@vibestudio/rpc";
import {
  eventKindSchemas,
} from "@workspace/agentic-protocol";
import {
  openPlatformAgentSession,
  type AgentHostCall,
} from "./native-agent-session.js";
import {
  bindNativeModelInvocation,
  bindNativeToolInvocation,
  prepareNativeInvocationTerminals,
  type NativeInvocationTerminalPublication,
} from "./native-invocation-boundary.js";

const testRpcMethods = createRpcMethods(
  "test",
  {
    "test.protected": {
      website: { kind: "closed", reason: "Test receiver" } as const,
      args: z.tuple([]),
      returns: z.null(),
    },
  },
  "",
);

const context = BACKGROUND_CONTEXT;
const owner = {
  runtimeId: "do:workers/native:Agent:one",
  authoritySessionId: "lifetime:one",
  contextId: "context:one",
  incarnation: "storage:one",
};
const image = {
  runtimeId: owner.runtimeId,
  source: "workers/native",
  className: "Agent",
  objectKey: "one",
  executionDigest: "a".repeat(64),
};

const callHost: AgentHostCall = createMainRpcCaller(
  schemaRpcMock({ call: async (_target, _method) => "accepted" }),
);
const sessions: Harness[] = [];
afterEach(async () => {
  await Promise.all(
    sessions.splice(0).map((session) => session.close(context)),
  );
});

async function fixture(options: { failStart?: boolean } = {}) {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const starts: { event: ReturnType<(typeof eventKindSchemas)["invocation.started"]["parse"]>; key: string }[] =
    [];
  const protectedCalls: RpcCallOptions[] = [];
  const rpc: RpcClient = schemaRpcClientMock(
    {
      async call(
        _target: string,
        _method: string,
        _args: unknown[],
        opts?: RpcCallOptions,
      ) {
        protectedCalls.push(opts ?? {});
        return null;
      },
      async stream() {
        throw new Error("Unexpected stream");
      },
    },
    owner.runtimeId,
  );
  let harness!: Harness;
  let ready = false;
  let taskId!: TaskId;
  const publication = createNativeChannelPublication({ publish: async (_channel, _participant, event, key) => {
    if (event.kind !== "invocation.started") throw new Error("Unexpected boundary event");
    starts.push({ event: eventKindSchemas["invocation.started"].parse(event), key });
    return { id: 17 };
  } });
  const registry = createRegistry();
  registry.install(defineExtension({ name: "publication", tasks: [publication.task] }));
  harness = await openPlatformAgentSession(
    async () => new MemoryStorage(),
    image,
        { ...owner, generation: 1, executionDigest: image.executionDigest, effectiveVersion: "state:one" },
    callHost,
    {
      models,
      registry,
      modelRequests: async (request, api, ctx) => {
        taskId = request.taskId;
        const execution = await bindNativeModelInvocation(
          {
            harness,
            image,

            rpc,
            enqueueStart: options.failStart ? async () => { throw new Error("publication admission failed"); } : publication.enqueueStart,
          },
          request,
          api,
          ctx,
        );
        if (!ready)
          return {
            status: "waiting",
            condition: {
              kind: "input",
              conversationId: request.conversationId,
              after: request.cutoff,
              kinds: ["test.ready"],
            },
          };
        await execution.rpc.call("main", testRpcMethods["test.protected"], []);
        return { status: "ready", options: {}, close: async () => {} };
      },
    },
    context,
  );
  sessions.push(harness);
  const conversation = await openNativeChannelConversation(harness, { channelId: "channel:one", contextId: owner.contextId, channelRef: { source: "workers/channel", className: "ChannelDO", objectKey: "channel:one" } }, { model: { provider: "faux", modelId: faux.getModel().id } }, context);
  faux.setResponses([fauxAssistantMessage("answer")]);
  await conversation.submit({ type: "input", content: "go" }, context);
  await harness.runPass(context);
  return {
    harness,
    conversation,
    starts,
    protectedCalls,
    taskId: () => taskId,
    resume: async () => {
      ready = true;
      await harness.commit(
        (tx) => tx.appendEntry(conversation.id, { kind: "test.ready" }),
        context,
      );
      await harness.runPass(context);
    },
  };
}

describe("native invocation publication boundary", () => {
  it("captures nested program results before the parent retires its call documents", async () => {
    const models = createModels();
    const faux = fauxProvider();
    models.setProvider(faux.provider);
    const registry = createRegistry();
    const events: { kind: string; result?: unknown }[] = [];
    const captured: NativeInvocationTerminalPublication[] = [];
    const publication = createNativeChannelPublication({ publish: async (_channel, _participant, event) => {
      events.push(event);
      return { id: events.length };
    } });
    let harness!: Harness;
    let parent!: TaskId;
    const rpc = schemaRpcClientMock({ call: async () => null, stream: async () => { throw new Error("Unexpected stream"); } }, owner.runtimeId);
    const inner = defineTool({
      name: "nested_child", description: "Returns a program value", callers: ["tools"],
      parameters: Type.Object({}), structuredOutputSchema: Type.Object({ value: Type.Number() }),
      async execute(_args, api, ctx) {
        await bindNativeToolInvocation({ harness, image, rpc, enqueueStart: publication.enqueueStart }, api, ctx);
        return { output: [{ type: "text" as const, text: "model presentation" }], structuredOutput: { value: 42 } };
      },
    });
    const outer = defineTool({
      name: "nested_parent", description: "Owns a nested child", parameters: Type.Object({}),
      async execute(_args, api, ctx) {
        parent = api.taskId;
        const result = await api.executeTool("nested_child", {}, ctx, { key: "owned-child" });
        expect(result.structuredOutput).toEqual({ value: 42 });
        return { output: [{ type: "text" as const, text: "joined" }] };
      },
    });
    registry.install(defineExtension({ name: "nested-publication", tools: [outer, inner], tasks: [publication.task] }));
    harness = await openPlatformAgentSession(async () => new MemoryStorage(), image,
      { ...owner, generation: 1, executionDigest: image.executionDigest, effectiveVersion: "state:one" }, callHost,
      { models, registry, prepareCommit: (tx, staged) => prepareNativeInvocationTerminals(tx, staged.tasks, async (_tx, terminal) => {
        captured.push(terminal);
      }) }, context);
    sessions.push(harness);
    const conversation = await openNativeChannelConversation(harness, { channelId: "channel:one", contextId: owner.contextId, channelRef: { source: "workers/channel", className: "ChannelDO", objectKey: "channel:one" } }, { model: { provider: "faux", modelId: faux.getModel().id } }, context);
    await conversation.configure({ tools: [outer, inner] }, context);
    faux.setResponses([fauxAssistantMessage([fauxToolCall("nested_parent", {})], { stopReason: "toolUse" }), fauxAssistantMessage("done")]);
    await (await conversation.submit({ type: "input", content: "go" }, context)).wait(context);
    await harness.waitForIdle(context);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.source.operation.kind).toBe("nested-tool");
    expect(captured[0]!.nestedResult?.structuredOutput).toEqual({ value: 42 });
    expect(await harness.snapshot(NestedCallDoc, parent, "owned-child", context)).toBeUndefined();
    expect(captured[0]!.nestedResult).toMatchObject({ structuredOutput: { value: 42 }, isError: false });
  });

  it("admits one actual source publication before protected execution and reuses it after a native wait", async () => {
    const state = await fixture();
    expect(state.starts).toHaveLength(1);
    expect(state.protectedCalls).toHaveLength(0);
    const start = state.starts[0]!.event;
    if (start.kind !== "invocation.started")
      throw new Error("Expected actual native source start");
    expect(
      eventKindSchemas["invocation.started"].parse(start).payload.nativeSource,
    ).toMatchObject({
      task: { taskId: state.taskId() },
      owner: { authoritySessionId: owner.authoritySessionId },
    });
    await state.resume();
    expect(state.starts).toHaveLength(1);
    expect(state.protectedCalls).toHaveLength(1);
    expect(state.protectedCalls[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(state.protectedCalls[0]!.causalParent?.invocationId).toBe(
      state.starts[0]!.event.causality?.invocationId,
    );
    const terminal = await state.harness.commit(
      (tx) => tx.task(state.taskId()),
      context,
    );
    expect(terminal?.state.status).toBe("terminal");
    const publications: NativeInvocationTerminalPublication[] = [];
    await state.harness.commit(
      (tx) =>
        prepareNativeInvocationTerminals(
          tx,
          [terminal!],
          async (_tx, publication) => {
            publications.push(publication);
          },
        ),
      context,
    );
    expect(publications).toHaveLength(1);
    expect(publications[0]!.outcome.status).toBe("completed");
    expect(publications[0]!.start).toEqual(state.starts[0]!.event);
    await state.harness.commit(
      (tx) =>
        prepareNativeInvocationTerminals(
          tx,
          [terminal!],
          async (_tx, publication) => {
            publications.push(publication);
          },
        ),
      context,
    );
    expect(publications).toHaveLength(1);
  });

  it("rejects failed publication admission atomically and grants no protected caller", async () => {
    const state = await fixture({ failStart: true });
    expect(state.protectedCalls).toHaveLength(0);
    const terminal = await state.harness.commit(
      (tx) => tx.task(state.taskId()),
      context,
    );
    expect(terminal?.state.status).toBe("terminal");
    const publications: NativeInvocationTerminalPublication[] = [];
    await state.harness.commit(
      (tx) =>
        prepareNativeInvocationTerminals(
          tx,
          [terminal!],
          async (_tx, publication) => {
            publications.push(publication);
          },
        ),
      context,
    );
    expect(publications).toHaveLength(0);
    expect(state.starts).toHaveLength(0);
    if (terminal?.state.status !== "terminal") throw new Error("Missing original failure");
    expect(terminal.state.outcome.status).toBe("faulted");
  });

  it("rolls back removal if atomic publication admission fails, leaving the exact outcome retryable", async () => {
    const state = await fixture();
    await state.resume();
    const terminal = await state.harness.commit(
      (tx) => tx.task(state.taskId()),
      context,
    );
    await expect(
      state.harness.commit(
        (tx) =>
          prepareNativeInvocationTerminals(tx, [terminal!], async () => {
            throw new Error("delivery admission failed");
          }),
        context,
      ),
    ).rejects.toThrow("delivery admission failed");
    const publications: NativeInvocationTerminalPublication[] = [];
    await state.harness.commit(
      (tx) =>
        prepareNativeInvocationTerminals(
          tx,
          [terminal!],
          async (_tx, publication) => {
            publications.push(publication);
          },
        ),
      context,
    );
    expect(publications).toHaveLength(1);
    expect(publications[0]!.start).toEqual(state.starts[0]!.event);
  });
});
