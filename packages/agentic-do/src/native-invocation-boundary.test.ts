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
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  MemoryStorage,
  type Harness,
  type TaskId,
} from "@panticonic/pi-durable";
import type { RpcClient, RpcCallOptions } from "@vibestudio/rpc";
import {
  eventKindSchemas,
  type AgenticEvent,
} from "@workspace/agentic-protocol";
import {
  openBoundAgentSession,
  type AgentHostCall,
} from "./native-agent-session.js";
import {
  bindNativeModelInvocation,
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
const callHost: AgentHostCall = createMainRpcCaller(
  schemaRpcMock({ call: async () => entity }),
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
  const starts: { event: AgenticEvent<"invocation.started">; key: string }[] =
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
  harness = await openBoundAgentSession(
    new MemoryStorage(),
    owner,
    {
      models,
      registry: createRegistry(),
      publishWake: async () => {},
      modelRequests: async (request, api, ctx) => {
        taskId = request.taskId;
        const execution = await bindNativeModelInvocation(
          {
            harness,
            image,
            callHost,
            rpc,
            publishStart: async (_channel, event, key) => {
              starts.push({ event, key });
              if (options.failStart)
                throw new Error("channel publication failed");
              return { id: 17 };
            },
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
  const conversation = await harness.root(context, {
    agent: { model: { provider: "faux", modelId: faux.getModel().id } },
  });
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
  it("publishes one actual source before protected execution and reuses it after a native wait", async () => {
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

  it("retains the exact owed start when channel acceptance fails and grants no protected caller", async () => {
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
    expect(publications).toHaveLength(1);
    expect(publications[0]!.start).toEqual(state.starts[0]!.event);
    expect(publications[0]!.startIdempotencyKey).toBe(state.starts[0]!.key);
    expect(publications[0]!.outcome.status).toBe("faulted");
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
