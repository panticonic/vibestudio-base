import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createModels,
  fauxProvider,
  fauxAssistantMessage,
  fauxToolCall,
  Type,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  Harness,
  ReceiptDoc,
  createRegistry,
  defineExtension,
  type TaskId,
  type ToolRegistration,
} from "@panticonic/pi-durable";
import { openNodeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  type AgenticEvent,
} from "@workspace/agentic-protocol";
import {
  getChannelPolicy,
  type ChannelCallDescriptor,
} from "@workspace/channel-policies";
import type { ChannelEvent } from "@workspace/pubsub";
import { ChannelClient } from "./channel-client.js";
import { createNativeChannelMethodTools } from "./native-channel-method-tools.js";
import { prepareNativeProductContexts } from "./native-product-context.js";
import {
  consumeNativeChannelMethodReceipt,
  createNativeChannelMethodExecution,
  type NativeChannelMethodRequest,
} from "./native-channel-method.js";

const context = BACKGROUND_CONTEXT;
const sessions: Harness[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    sessions.splice(0).map((harness) => harness.close(context)),
  );
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
const builders = getChannelPolicy("agentic.conversation.v1").callEventPayload!;

async function fixture(
  options: {
    fast?: boolean;
    loseStart?: boolean;
    failCancel?: boolean;
    failCancelTarget?: string;
    targets?: string[];
    advertised?: boolean;
  } = {},
) {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const registry = createRegistry();
  const directory = await mkdtemp(join(tmpdir(), "native-channel-method-"));
  directories.push(directory);
  let harness!: Harness;
  let taskId!: TaskId;
  let key = "";
  let selections = 0;
  let failStart = !!options.loseStart;
  let failCancel = !!options.failCancel;
  const startFailure = new Error(
    "original accepted channel start acknowledgement lost",
  );
  const cancelFailure = new Error("original channel provider cleanup failed");
  const events = new Map<string, ChannelEvent>();
  const routes = new Map<string, ChannelCallDescriptor>();
  const starts: ChannelCallDescriptor[] = [];
  const cancels: string[] = [];
  const partialHints: boolean[] = [];
  let seq = 0;
  const request: NativeChannelMethodRequest = {
    channelId: "channel:one",
    callerId: "agent:one",
    targetIds: options.targets ?? ["user:one"],
    method: options.advertised ? "inline_ui" : "feedback_form",
    args: options.advertised
      ? { path: "skills/onboarding/SetupHub.tsx" }
      : { question: "Exact native question" },
  };
  function append(id: string, payload: AgenticEvent) {
    const existing = events.get(id);
    if (existing) return existing;
    const event: ChannelEvent = {
      id: ++seq,
      messageId: id,
      type: AGENTIC_EVENT_PAYLOAD_KIND,
      payload,
      senderId: request.callerId,
      ts: seq,
    };
    events.set(id, event);
    return event;
  }
  function complete(
    callId: string,
    value: unknown = "actual human answer",
    isError = false,
  ) {
    const route = routes.get(callId);
    if (!route) throw Error("Missing actual started call");
    append(
      `terminal:${callId}`,
      builders.terminal({
        descriptor: route,
        result: value,
        isError,
        createdAt: new Date().toISOString(),
      }),
    );
  }
  const rpc = {
    stream: async () => {
      throw new Error("Method receipt fixture cannot stream");
    },
    call: async <T>(
      _target: string,
      method: string,
      args: unknown[],
    ): Promise<T> => {
      if (method === "workers.resolveService")
        return { kind: "durable-object", targetId: "channel-do" } as T;
      if (method === "getEnvelope")
        return (events.get(args[0] as string) ?? null) as T;
      if (method === "callMethod") {
        const [callerId, targetId, callId, name, input, opts] = args as [
          string,
          string,
          string,
          string,
          unknown,
          { invocationId: string; transportCallId: string; turnId?: string },
        ];
        if (!routes.has(callId)) {
          const route: ChannelCallDescriptor = {
            channelId: "channel:one",
            caller: { kind: "agent", id: callerId as never },
            target: { kind: "user", id: targetId as never },
            method: name,
            args: input,
            invocationId: opts.invocationId,
            transportCallId: opts.transportCallId,
            ...(opts.turnId ? { turnId: opts.turnId } : {}),
            createdAt: new Date().toISOString(),
          };
          routes.set(callId, route);
          starts.push(route);
          append(route.invocationId, builders.started(route));
          if (options.fast && starts.length === 1) {
            complete(callId);
            partialHints.push(
              (
                await consumeNativeChannelMethodReceipt(
                  harness,
                  harness,
                  key,
                  client,
                  context,
                )
              ).accepted,
            );
          }
        }
        if (failStart) {
          failStart = false;
          throw startFailure;
        }
        return undefined as T;
      }
      if (method === "cancelMethodCall") {
        const [callerId, callId] = args as [string, string];
        expect(callerId).toBe("agent:one");
        cancels.push(callId);
        const route = routes.get(callId);
        if (!route) throw Error("Cancellation manufactured an unstarted call");
        append(
          `terminal:${callId}`,
          builders.cancelled({
            descriptor: route,
            actor: { kind: "system", id: "system" as never },
            reason: "cancelled",
            createdAt: new Date().toISOString(),
          }),
        );
        if (
          failCancel &&
          (!options.failCancelTarget ||
            route.target.id === options.failCancelTarget)
        )
          throw cancelFailure;
        return undefined as T;
      }
      throw Error(`Unexpected channel method ${method}`);
    },
  };
  const client = new ChannelClient(rpc, "channel:one");
  const execution = createNativeChannelMethodExecution({
    harness: () => harness,
    channelClient: (channelId) => {
      expect(channelId).toBe("channel:one");
      return client;
    },
    bindExecution: async (api) => {
      taskId = api.taskId;
      const invocationId = `native-task:${api.taskId}`;
      key = `${invocationId}:channel-method`;
      return { invocationId, commandId: invocationId, rpc: rpc as never };
    },
  });
  const offeredTool = (targetId: string) =>
    createNativeChannelMethodTools(
      "channel:one",
      "agent:one",
      [
        {
          participantId: targetId,
          ref: { kind: "user", id: targetId as never },
          methods: [
            {
              name: "inline_ui",
              description: "Render the actual onboarding card",
              parameters: {
                type: "object",
                properties: { path: { type: "string" } },
                required: ["path"],
              },
            },
          ],
        },
      ],
      new Set(),
      execution,
    )[0]!;
  const tool: ToolRegistration = options.advertised
    ? offeredTool("user:one")
    : {
        name: "ask",
        parameters: Type.Object({}),
        description: "Actual channel question",
        replay: "safe",
        execute: (_args, api, ctx) =>
          execution.execute(
            async () => {
              selections++;
              return request;
            },
            api,
            ctx,
          ),
        cancel: (_args, api, ctx) => execution.cancel(api, ctx),
      };
  registry.install(
    defineExtension({ name: "native-channel-method", tools: [tool] }),
  );
  const open = async () => {
    harness = await Harness.open(
      await openNodeSqliteStorage(join(directory, "owner.sqlite")),
      {
        models,
        registry,
        prepareCommit: (tx, staged) => prepareNativeProductContexts(tx, staged),
      },
      context,
    );
    sessions.push(harness);
    return harness;
  };
  await open();
  const root = await harness.root(context, {
    agent: {
      model: { provider: "faux", modelId: faux.getModel().id },
      tools: [tool],
    },
  });
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall(
          tool.name,
          options.advertised ? { path: "skills/onboarding/SetupHub.tsx" } : {},
          { id: "same-provider-call" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("done"),
  ]);
  const submission = await root.submit(
    { type: "input", content: "go" },
    context,
  );
  await harness.runPass(context);
  if (!starts.length)
    throw new Error(
      "Native tool failed before channel admission: " +
        JSON.stringify(await harness.getTask(taskId, context)),
    );
  return {
    get harness() {
      return harness;
    },
    root,
    submission,
    taskId: () => taskId,
    key: () => key,
    starts,
    cancels,
    events,
    request,
    selections: () => selections,
    complete,
    client,
    startFailure,
    cancelFailure,
    partialHints,
    allowCancel: () => {
      failCancel = false;
    },
    open,
    replaceOffer: () =>
      registry.install(
        defineExtension({
          name: "native-channel-method",
          tools: [offeredTool("user:replacement")],
        }),
      ),
  };
}

describe("native channel method ownership", () => {
  it("executes an advertised inline tool and consumes its original completion after SQLite and executable replacement", async () => {
    const f = await fixture({ advertised: true });
    expect(f.starts).toHaveLength(1);
    expect(f.starts[0]).toMatchObject({
      method: "inline_ui",
      target: { id: "user:one" },
      args: { path: "skills/onboarding/SetupHub.tsx" },
      // The executing participant learns the calling native turn.
      turnId: `native-run:${f.root.id}:${f.submission.id}`,
    });
    const conversationId = f.root.id;
    await f.harness.close(context);
    sessions.splice(sessions.indexOf(f.harness), 1);
    f.replaceOffer();
    await f.open();
    f.complete(f.starts[0]!.transportCallId, { rendered: true });
    await consumeNativeChannelMethodReceipt(
      f.harness,
      f.harness,
      f.key(),
      f.client,
      context,
    );
    await f.harness.runPass(context);
    const replacement = await f.harness.conversation(conversationId, context);
    await replacement!.waitForIdle(context);
    expect(f.starts).toHaveLength(1);
    expect(
      (await f.harness.snapshot(ReceiptDoc, f.key(), context))?.result,
    ).toMatchObject({ value: { rendered: true } });
  });
  it("joins cancellation of the original advertised client operation", async () => {
    const f = await fixture({ advertised: true });
    await f.root.abort(context);
    expect(f.cancels).toEqual([f.starts[0]!.transportCallId]);
    expect(
      (await f.harness.waitForTask(f.taskId(), context)).state.outcome.status,
    ).toBe("aborted");
    expect(f.starts).toHaveLength(1);
  });
  it("retains an advertised tool's original provider failure through native settlement", async () => {
    const f = await fixture({ advertised: true });
    f.complete(
      f.starts[0]!.transportCallId,
      { error: "Original inline component compilation failed" },
      true,
    );
    await consumeNativeChannelMethodReceipt(
      f.harness,
      f.harness,
      f.key(),
      f.client,
      context,
    );
    expect(await f.submission.wait(context)).toMatchObject({ status: "done" });
    expect(
      (await f.harness.snapshot(ReceiptDoc, f.key(), context))?.result,
    ).toMatchObject({
      kind: "invocation.failed",
      value: { error: "Original inline component compilation failed" },
    });
  });
  it("parks on a real receipt and retains immutable target and arguments after configuration changes", async () => {
    const f = await fixture();
    expect((await f.harness.getTask(f.taskId(), context))?.state).toMatchObject(
      { status: "waiting", condition: { kind: "receipt", key: f.key() } },
    );
    f.request.targetIds = ["user:new"];
    f.request.args = { question: "changed question" };
    f.complete(f.starts[0]!.transportCallId, { answer: 42 });
    await consumeNativeChannelMethodReceipt(
      f.harness,
      f.harness,
      f.key(),
      f.client,
      context,
    );
    expect(await f.submission.wait(context)).toMatchObject({ status: "done" });
    expect(f.selections()).toBe(1);
    expect(f.starts).toHaveLength(1);
    expect(
      (await f.harness.snapshot(ReceiptDoc, f.key(), context))?.result,
    ).toMatchObject({ value: { answer: 42 } });
    expect(
      (await f.harness.snapshot(ReceiptDoc, f.key(), context))?.result,
    ).toHaveProperty("kind", "invocation.completed");
  });
  it("keeps fast fan-out answers pending until every selected start exists, then joins losing calls", async () => {
    const f = await fixture({ fast: true, targets: ["user:one", "user:two"] });
    expect(await f.submission.wait(context)).toMatchObject({ status: "done" });
    expect(f.partialHints).toEqual([false]);
    expect(f.starts).toHaveLength(2);
    expect(new Set(f.starts.map((call) => call.invocationId)).size).toBe(2);
    expect(f.cancels).toEqual([f.starts[1]!.transportCallId]);
    expect(
      f.starts.every((call) => call.invocationId !== "native-task:1"),
    ).toBe(true);
  });
  it("retains the selected winner until failed losing-call cleanup is joined", async () => {
    const f = await fixture({
      fast: true,
      failCancel: true,
      targets: ["user:one", "user:two"],
    });
    await expect(f.root.waitForIdle(context)).rejects.toBe(f.cancelFailure);
    expect(
      (await f.harness.snapshot(ReceiptDoc, f.key(), context))?.result,
    ).toBeUndefined();
    const task = await f.harness.getTask(f.taskId(), context);
    if (
      task?.state.status !== "waiting" ||
      task.state.condition.kind !== "failure"
    )
      throw Error("Missing retained native winner cleanup");
    f.allowCancel();
    await f.harness.retryTask(
      f.taskId(),
      task.state.condition.incident,
      context,
    );
    expect(await f.submission.wait(context)).toMatchObject({ status: "done" });
    expect(f.selections()).toBe(1);
    expect(f.starts).toHaveLength(2);
    expect(f.cancels).toEqual([
      f.starts[1]!.transportCallId,
      f.starts[1]!.transportCallId,
    ]);
    expect(
      (await f.harness.snapshot(ReceiptDoc, f.key(), context))?.result,
    ).toMatchObject({ value: "actual human answer" });
  });

  it("joins all other human cleanup even when one losing provider fails", async () => {
    const f = await fixture({
      fast: true,
      failCancel: true,
      failCancelTarget: "user:two",
      targets: ["user:one", "user:two", "user:three"],
    });
    await expect(f.root.waitForIdle(context)).rejects.toBe(f.cancelFailure);
    expect(f.cancels).toEqual([
      f.starts[1]!.transportCallId,
      f.starts[2]!.transportCallId,
    ]);
    expect(
      (await f.harness.snapshot(ReceiptDoc, f.key(), context))?.result,
    ).toBeUndefined();
    const task = await f.harness.getTask(f.taskId(), context);
    if (
      task?.state.status !== "waiting" ||
      task.state.condition.kind !== "failure"
    )
      throw Error("Missing exact losing provider cleanup");
    f.allowCancel();
    await f.harness.retryTask(
      f.taskId(),
      task.state.condition.incident,
      context,
    );
    expect(await f.submission.wait(context)).toMatchObject({ status: "done" });
    expect(f.starts).toHaveLength(3);
  });

  it("rejects a substituted original start without accepting a forged hint result", async () => {
    const f = await fixture();
    f.complete(f.starts[0]!.transportCallId);
    const start = f.events.get(f.starts[0]!.invocationId)!;
    const original = start.payload;
    start.payload = {
      ...(original as object),
      payload: {
        ...(original as { payload: object }).payload,
        request: { question: "substituted" },
      },
    };
    await expect(
      consumeNativeChannelMethodReceipt(
        f.harness,
        f.harness,
        f.key(),
        f.client,
        context,
      ),
    ).rejects.toThrow("conflicts with its native admission");
    expect(
      (await f.harness.snapshot(ReceiptDoc, f.key(), context))?.result,
    ).toBeUndefined();
    start.payload = original;
    await consumeNativeChannelMethodReceipt(
      f.harness,
      f.harness,
      f.key(),
      f.client,
      context,
    );
    expect(await f.submission.wait(context)).toMatchObject({ status: "done" });
  });
  it("retains lost start acknowledgement and failed cancellation under the native task for exact retry", async () => {
    const f = await fixture({ loseStart: true, failCancel: true });
    await expect(f.root.waitForIdle(context)).rejects.toBe(f.startFailure);
    await expect(f.root.abort(context)).rejects.toBe(f.cancelFailure);
    const task = await f.harness.getTask(f.taskId(), context);
    if (
      task?.state.status !== "waiting" ||
      task.state.condition.kind !== "failure"
    )
      throw Error("Missing native cleanup ownership");
    expect(task.abortRequested).toBe(true);
    f.allowCancel();
    await f.harness.retryTask(
      f.taskId(),
      task.state.condition.incident,
      context,
    );
    expect(
      (await f.harness.waitForTask(f.taskId(), context)).state.outcome.status,
    ).toBe("aborted");
    expect(f.starts).toHaveLength(1);
    expect(f.cancels).toHaveLength(2);
  });
  it("consumes canonical completion after Session replacement without selecting a new route", async () => {
    const f = await fixture();
    const id = f.root.id;
    await f.harness.close(context);
    sessions.splice(sessions.indexOf(f.harness), 1);
    await f.open();
    f.request.targetIds = ["user:replacement"];
    f.complete(f.starts[0]!.transportCallId);
    await consumeNativeChannelMethodReceipt(
      f.harness,
      f.harness,
      f.key(),
      f.client,
      context,
    );
    await f.harness.runPass(context);
    const replacement = await f.harness.conversation(id, context);
    if (!replacement) throw Error("Missing replacement native conversation");
    await replacement.waitForIdle(context);
    expect(f.selections()).toBe(1);
    expect(f.starts).toHaveLength(1);
    expect(
      (await f.harness.snapshot(ReceiptDoc, f.key(), context))?.result,
    ).toMatchObject({ value: "actual human answer" });
  });
});
