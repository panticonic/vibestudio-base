import { bindNativeChannelConversation } from "./native-channel-session.js";
import { createNativeChannelPublication } from "./native-channel-publication.js";
import { createMainRpcCaller } from "@vibestudio/service-schemas/mainRpc";
import { schemaRpcClientMock } from "@vibestudio/rpc/test-utils";
import { RemoteRpcError, serializeRpcFailure } from "@vibestudio/rpc";
import { afterEach, describe, expect, it } from "vitest";
import {
  createModels,
  fauxProvider,
  fauxAssistantMessage,
  fauxToolCall,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  defineExtension,
  type Harness,
  type TaskId,
} from "@panticonic/pi-durable";
import { openNodeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RpcClient } from "@vibestudio/rpc";
import type { EvalResultReceipt } from "@vibestudio/service-schemas/eval";
import { ReceiptDoc } from "@panticonic/pi-durable";
import { createEvalTool } from "@workspace/harness/tools/eval";
import { createNativeEvalExecution } from "./native-eval-tool.js";
import {
  createNativeEvalAcknowledgements,
  createNativeEvalAwait,
  evalHostId,
  retainedEvalAdmission,
} from "./native-eval-receipts.js";
import { bindNativeToolInvocation } from "./native-invocation-boundary.js";
import {
  openPlatformAgentSession,
  type AgentHostCall,
} from "./native-agent-session.js";
const context = BACKGROUND_CONTEXT;
const sessions: Harness[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    sessions.splice(0).map((session) => session.close(context)),
  );
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
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

async function fixture(
  options: {
    loseStart?: boolean;
    failCancelRead?: boolean;
    fastResult?: boolean;
    imageResult?: boolean;
    rejectStart?: Error;
    rejectAfterLostStart?: Error;
    /** The first N `await` pulls fail as a lost transport would. */
    failAwaits?: number;
  } = {},
) {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const registry = createRegistry();
  let harness!: Harness;
  let taskId!: TaskId;
  let runId = "";
  const scopes = new Map<number, string>();
  let receipt: EvalResultReceipt | null = null;
  let loseStart = !!options.loseStart;
  let failRead = !!options.failCancelRead;
  const original = new Error("original start response lost");
  const cleanup = new Error("original canonical cancel read failed");
  const starts: unknown[] = [];
  const kernelStarts: unknown[] = [];
  const publications: unknown[] = [];
  const progress: unknown[] = [];
  const calls: string[] = [];
  const pulledEvents: unknown[] = [];
  let sessionId = evalHostId(owner.runtimeId);
  const terminal = (cancelled = false): EvalResultReceipt => ({
    runId,
    runDigest: "b".repeat(64),
    resultDigest: "c".repeat(64),
    result: cancelled
      ? {
          success: false,
          console: "",
          failureKind: "cancelled",
          error: serializeRpcFailure(new Error("actual canonical cancellation")),
        }
      : {
          success: true,
          console: "actual console",
          returnValue: options.imageResult
            ? {
                protocol: "eval-image-artifact.v1",
                digest: "a".repeat(64),
                size: 24,
                mimeType: "image/png",
              }
            : 42,
        },
    acknowledged: false,
  });
  let admissions = 0;
  let failAwaits = options.failAwaits ?? 0;
  const wireCall = async (
    target: string,
    method: string,
    args: unknown[],
  ): Promise<unknown> => {
    calls.push(method);
    if (method === "blobstore.getBase64") {
      expect(args).toEqual(["a".repeat(64)]);
      return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
    }
    if (method === "dynamicCode.admit") {
      admissions += 1;
      starts.push(args[0]);
      runId = (args[0] as { runId: string }).runId;
      sessionId = evalHostId(owner.runtimeId);
      if (options.rejectStart) throw options.rejectStart;
      if (options.rejectAfterLostStart && admissions > 1)
        throw options.rejectAfterLostStart;
      return {
        runId,
        runDigest: "b".repeat(64),
        authorityManifestDigest: "d".repeat(64),
        host: { source: "workers/agent-worker", className: "AiChatWorker", objectKey: "k" },
        hostId: sessionId,
        nonce: "nonce-one",
        start: { runId },
      };
    }
    if (method === "dynamicCode.release") return { released: true };
    // Everything else is a call on the entity that hosts the kernel: the owner itself.
    expect(target).toBe(sessionId);
    if (method === "start") {
      kernelStarts.push(args);
      expect(args[1]).toBe("nonce-one");
      if (options.fastResult) receipt = terminal();
      if (loseStart) {
        loseStart = false;
        throw original;
      }
      return {
        runId,
        runDigest: "b".repeat(64),
        status: receipt ? "done" : "pending",
        existing: false,
      };
    }
    if (method === "cancel") {
      receipt = terminal(true);
      return { ok: true, forcedReset: false };
    }
    if (method === "receipt") {
      if (receipt?.result.failureKind === "cancelled" && failRead)
        throw cleanup;
      return receipt;
    }
    if (method === "await") {
      if (failAwaits-- > 0) throw new Error("pull transport lost");
      if (receipt)
        return { status: receipt.result.failureKind === "cancelled" ? "cancelled" : "done" };
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { status: "running" };
    }
    if (method === "events")
      return { events: [...pulledEvents], next: pulledEvents.length, hasMore: false };
    if (method === "acknowledge") {
      expect(args[0]).toBe(runId);
      expect(args[1]).toMatchObject({
        runDigest: "b".repeat(64),
        resultDigest: "c".repeat(64),
      });
      return { acknowledged: true, duplicate: false };
    }
    throw Error(`unexpected call ${method}`);
  };
  const rpc: RpcClient = schemaRpcClientMock(
    {
      call: (
        target: Parameters<RpcClient["call"]>[0],
        method: string,
        args: unknown[],
      ) => wireCall(target, method, args),
      stream: () => {
        throw Error("unexpected stream");
      },
    },
    owner.runtimeId,
  );
  const callHost: AgentHostCall = createMainRpcCaller(
    schemaRpcClientMock({ call: async (_target, _method) => "accepted" }, owner.runtimeId),
  );
  const call = createMainRpcCaller(rpc);
  const acknowledgements = createNativeEvalAcknowledgements({
    rpc,
    ownerId: () => owner.runtimeId,
  });
  const awaiting = createNativeEvalAwait({
    rpc,
    ownerId: () => owner.runtimeId,
    acknowledgements,
    onEvents: async (_input, events) => {
      progress.push(...events);
    },
    waitMs: 5,
    cycleMs: 30,
    pauseMs: 5,
    retryBaseMs: 5,
  });
  const channelPublication = createNativeChannelPublication({ publish: async (_channel, _participant, event) => {
    publications.push(event);
    return { id: 17 };
  } });
  const execution = createNativeEvalExecution({
    harness: () => harness,
    acknowledgements,
    awaiting,
    ownerId: () => owner.runtimeId,
    scopeForConversation: async (conversationId) => {
      const scope = scopes.get(conversationId);
      if (!scope) throw new Error("Unknown conversation notebook scope");
      return scope;
    },
    bindExecution: (api, ctx) => {
      taskId = api.taskId;
      return bindNativeToolInvocation(
        {
          harness,
          image,
          rpc,
          enqueueStart: channelPublication.enqueueStart,
        },
        api,
        ctx,
      );
    },
  });
  const evalTool = createEvalTool({ execution });
  registry.install(
    defineExtension({
      name: "native-eval",
      tools: [evalTool],
      tasks: [acknowledgements.task, awaiting.task, channelPublication.task],
    }),
  );
  // A file-backed store, so a restart of the owner reopens what it committed.
  const directory = await mkdtemp(join(tmpdir(), "native-eval-tool-"));
  directories.push(directory);
  const open = () =>
    openPlatformAgentSession(
      async () => openNodeSqliteStorage(join(directory, "session.sqlite")),
      image,
      { ...owner, generation: 1, executionDigest: image.executionDigest, effectiveVersion: "state:one" },
      callHost,
      { models, registry },
      context,
    );
  harness = await open();
  sessions.push(harness);
  const root = await harness.root(context, {
    agent: {
      model: { provider: "faux", modelId: faux.getModel().id },
      tools: [evalTool],
    },
  });
  await harness.commit(tx => bindNativeChannelConversation(tx, root.id, { channelId: "channel:one", contextId: owner.contextId, channelRef: { source: "workers/channel", className: "ChannelDO", objectKey: "channel:one" } }), context);
  scopes.set(root.id, "channel:one");
  faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("eval", { code: "return 42;" }, { id: "eval-call" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("done"),
  ]);
  const submission = await root.submit(
    { type: "input", content: "go" },
    context,
  );
  await harness.runPass(context);
  return {
    get harness() {
      return harness;
    },
    root,
    submission,
    /** The owner goes away (its running work is interrupted) and comes back over the same storage. */
    restart: async () => {
      await harness.close(context);
      harness = await open();
      sessions.push(harness);
    },
    taskId: () => taskId,
    runId: () => runId,
    starts,
    kernelStarts,
    publications,
    progress,
    pulledEvents,
    calls,
    original,
    cleanup,
    acknowledgements,
    call,
    complete: () => {
      receipt = terminal();
    },
    allowRead: () => {
      failRead = false;
    },
    scopes,
    faux,
    evalTool,
    /** Run the owner's due work (what its alarm does) until `done`. */
    drive: async (done: () => Promise<boolean>) => {
      for (let i = 0; i < 400; i++) {
        await harness.runPass(context);
        if (await done()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("the owner's work did not settle");
    },
  };
}
describe("protected native Eval tool", () => {
  it("reads retained binary image bytes through the bound base64 RPC contract", async () => {
    const f = await fixture({ fastResult: true, imageResult: true });
    expect(f.calls).toContain("blobstore.getBase64");
    expect(f.calls).not.toContain("blobstore.getText");
    await f.harness.runPass(context);
  });

  it("delivers an exact admission refusal to the model and completes the original input without a failure rendezvous", async () => {
    const data = {
      denied: true,
      authorityFailure: {
        reasonCode: "run-manifest-denied",
        reason: "The exact allowlist is empty",
        capability: "permissions.read",
        resourceKey: "permissions.read",
        remediation: {
          kind: "broaden-run-manifest",
          message: "Declare the exact resource",
          request: {
            capability: "permissions.read",
            resource: { kind: "exact", key: "permissions.read" },
            tier: "gated",
          },
        },
      },
    };
    const f = await fixture({
      rejectStart: new RemoteRpcError(
        "Original admission refusal",
        "access",
        "ERUNMANIFEST",
        data,
      ),
    });
    await f.submission.wait(context);
    expect(await f.submission.status(context)).toMatchObject({
      status: "done",
    });
    const task = await f.harness.getTask(f.taskId(), context);
    expect(task?.state).toMatchObject({
      status: "terminal",
      outcome: { status: "completed" },
    });
    const entries = (await f.root.entries({}, 100, undefined, context)).items;
    const result = entries
      .flatMap((entry) => entry.model ?? [])
      .find((message) => message.role === "toolResult");
    expect(result).toMatchObject({
      isError: true,
      details: { failure: { code: "ERUNMANIFEST", kind: "authority", data } },
    });
    expect(JSON.stringify(result)).toContain("permissions.read");
    expect(f.calls).toEqual(["dynamicCode.admit"]);
    expect(
      await retainedEvalAdmission(f.harness, f.runId(), context),
    ).toMatchObject({
      runDigest: "",
      outcome: null,
      acknowledgement: null,
      awaiting: null,
    });
  });

  it("retains resumed admission denial after an ambiguous original start rather than abandoning its possible run", async () => {
    const denial = new RemoteRpcError(
      "Original resumed denial",
      "access",
      "EACCES",
      { denied: true },
    );
    const f = await fixture({ loseStart: true, rejectAfterLostStart: denial });
    await expect(f.root.waitForIdle(context)).rejects.toBe(f.original);
    const initial = await f.harness.getTask(f.taskId(), context);
    if (
      initial?.state.status !== "waiting" ||
      initial.state.condition.kind !== "failure"
    )
      throw new Error("Missing original admission incident");
    await f.harness.retryTask(
      f.taskId(),
      initial.state.condition.incident,
      context,
    );
    await expect(f.root.waitForIdle(context)).rejects.toBe(denial);
    expect(await f.harness.getTask(f.taskId(), context)).toMatchObject({
      state: {
        status: "waiting",
        checkpoint: { continuation: { kind: "eval", runId: f.runId() } },
        condition: { kind: "failure", error: { message: denial.message } },
      },
    });
    expect(f.starts).toHaveLength(2);
  });

  it.each(["protocol", "transport", "internal"] as const)(
    "retains a structured %s failure under its original Pi task",
    async (kind) => {
      const original = new RemoteRpcError(
        "Original infrastructure failure",
        kind,
        "EINFRASTRUCTURE",
      );
      const f = await fixture({ rejectStart: original });
      await expect(f.root.waitForIdle(context)).rejects.toBe(original);
      expect(await f.harness.getTask(f.taskId(), context)).toMatchObject({
        state: {
          status: "waiting",
          condition: { kind: "failure", error: { message: original.message } },
        },
      });
      expect(f.calls).toEqual(["dynamicCode.admit"]);
    },
  );

  it("keeps two conversations of one owner in their actual channel notebooks", async () => {
    const f = await fixture({ fastResult: true });
    await f.submission.wait(context);
    await f.harness.runPass(context);
    const firstRun = f.runId();
    const second = await f.harness.createConversation(
      {
        ownership: { kind: "ownerless" },
        agent: {
          model: { provider: "faux", modelId: f.faux.getModel().id },
          tools: [f.evalTool],
        },
      },
      context,
    );
    await f.harness.commit(tx => bindNativeChannelConversation(tx, second.id, { channelId: "channel:two", contextId: owner.contextId, channelRef: { source: "workers/channel", className: "ChannelDO", objectKey: "channel:two" } }), context);
    f.scopes.set(second.id, "channel:two");
    f.faux.setResponses([
      fauxAssistantMessage(
        [fauxToolCall("eval", { code: "return 42;" }, { id: "eval-call-two" })],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("done"),
    ]);
    await (
      await second.submit(
        { type: "input", content: "second notebook" },
        context,
      )
    ).wait(context);
    await f.harness.runPass(context);
    expect(f.starts).toEqual([
      expect.objectContaining({
        scope: { key: "channel:one" },
        runId: firstRun,
      }),
      expect.objectContaining({
        scope: { key: "channel:two" },
        runId: f.runId(),
      }),
    ]);
    expect(firstRun).not.toBe(f.runId());
    expect(
      (await retainedEvalAdmission(f.harness, firstRun, context))?.route
        .scopeKey,
    ).toBe("channel:one");
    expect(
      (await retainedEvalAdmission(f.harness, f.runId(), context))?.route
        .scopeKey,
    ).toBe("channel:two");
  });
  it("parks pending domain work; the await task pulls the committed completion and acknowledges with one owned task", async () => {
    const f = await fixture();
    expect(f.starts).toHaveLength(1);
    expect(f.kernelStarts).toHaveLength(1);
    expect(f.publications).toHaveLength(1);
    expect((await f.harness.getTask(f.taskId(), context))?.state).toMatchObject(
      { status: "waiting", condition: { kind: "receipt", key: f.runId() } },
    );
    const admission = await retainedEvalAdmission(f.harness, f.runId(), context);
    expect(admission?.awaiting).not.toBeNull();
    f.complete();
    await f.drive(async () => (await f.submission.status(context)).status === "done");
    expect(await f.submission.wait(context)).toMatchObject({ status: "done" });
    expect(f.starts).toHaveLength(1);
    expect(f.kernelStarts).toHaveLength(1);
    await f.harness.waitForTask(
      (await retainedEvalAdmission(f.harness, f.runId(), context))!
        .acknowledgement!,
      context,
    );
    expect(f.calls.filter((method) => method === "acknowledge")).toHaveLength(1);
    // The execution session is released once the run is terminal, by whoever pulled the row.
    expect(
      f.calls.filter((method) => method === "dynamicCode.release"),
    ).toHaveLength(1);
    const awaited = await f.harness.getTask(
      (await retainedEvalAdmission(f.harness, f.runId(), context))!.awaiting!,
      context,
    );
    expect(awaited?.state).toMatchObject({
      status: "terminal",
      outcome: { status: "completed" },
    });
  });
  it("hands the run's pulled events to the owner before the receipt is accepted", async () => {
    const f = await fixture();
    f.pulledEvents.push(
      { sequence: 1, at: 1, kind: "console", payload: { text: "hello" } },
      {
        sequence: 2,
        at: 2,
        kind: "authority-requested",
        payload: { capability: "fs.read" },
      },
    );
    f.complete();
    await f.drive(async () => (await f.submission.status(context)).status === "done");
    // Each event is handed over once, in order, though the pull ran several times.
    expect(f.progress).toEqual(f.pulledEvents);
  });
  it("an owner restart while the run is pending still gets its result exactly once", async () => {
    const f = await fixture();
    expect(f.kernelStarts).toHaveLength(1);
    // The owner goes away with the run pending; the run finishes while it is down.
    await f.restart();
    f.complete();
    const harness = f.harness;
    const admission = await retainedEvalAdmission(harness, f.runId(), context);
    expect(admission?.awaiting).not.toBeNull();
    await f.drive(
      async () =>
        (await harness.getTask(admission!.awaiting!, context))?.state.status === "terminal",
    );
    const awaited = await harness.waitForTask(admission!.awaiting!, context);
    expect(awaited.state.outcome.status).toBe("completed");
    const settled = await retainedEvalAdmission(harness, f.runId(), context);
    expect(settled?.outcome).toEqual({
      runDigest: "b".repeat(64),
      resultDigest: "c".repeat(64),
    });
    expect(
      (await harness.snapshot(ReceiptDoc, f.runId(), context))?.result,
    ).toMatchObject({ success: true, returnValue: 42 });
    await harness.waitForTask(settled!.acknowledgement!, context);
    // The parked tool call resumed with the pulled result and finished: the cell ran once.
    await f.drive(
      async () =>
        (await harness.getTask(f.taskId(), context))?.state.status === "terminal",
    );
    expect((await harness.getTask(f.taskId(), context))?.state).toMatchObject({
      status: "terminal",
      outcome: { status: "completed" },
    });
    // The same run was never started again, and its receipt was acknowledged once.
    expect(f.starts).toHaveLength(1);
    expect(f.kernelStarts).toHaveLength(1);
    expect(f.calls.filter((method) => method === "acknowledge")).toHaveLength(1);
    // A second restart finds nothing left to pull or acknowledge.
    await f.restart();
    await f.harness.runPass(context);
    expect(f.calls.filter((method) => method === "acknowledge")).toHaveLength(1);
    expect(f.kernelStarts).toHaveLength(1);
  });
  it("an owner restart between the terminal row and its acknowledgement still acknowledges once", async () => {
    const f = await fixture({ fastResult: true });
    expect(await f.submission.wait(context)).toMatchObject({ status: "done" });
    const ackTask = (await retainedEvalAdmission(f.harness, f.runId(), context))!
      .acknowledgement!;
    await f.restart();
    await f.harness.waitForTask(ackTask, context);
    expect(f.calls.filter((method) => method === "acknowledge")).toHaveLength(1);
    expect(f.kernelStarts).toHaveLength(1);
  });
  it("a pull that fails keeps the run: the await task sleeps and pulls again", async () => {
    const f = await fixture({ failAwaits: 2 });
    f.complete();
    await f.drive(async () => (await f.submission.status(context)).status === "done");
    expect(f.calls.filter((method) => method === "await").length).toBeGreaterThan(2);
    expect(f.kernelStarts).toHaveLength(1);
  });
  it("retains initial lost acknowledgement and failed cancellation/readback under the exact native task", async () => {
    const f = await fixture({ loseStart: true, failCancelRead: true });
    await expect(f.root.waitForIdle(context)).rejects.toBe(f.original);
    expect(f.starts).toHaveLength(1);
    await expect(f.root.abort(context)).rejects.toBe(f.cleanup);
    const failed = await f.harness.getTask(f.taskId(), context);
    expect(failed).toMatchObject({
      abortRequested: true,
      state: { status: "waiting", mode: "abort" },
    });
    if (
      failed?.state.status !== "waiting" ||
      failed.state.condition.kind !== "failure"
    )
      throw Error("no exact cancellation incident");
    f.allowRead();
    await f.harness.retryTask(
      f.taskId(),
      failed.state.condition.incident,
      context,
    );
    expect(
      (await f.harness.waitForTask(f.taskId(), context)).state.outcome.status,
    ).toBe("aborted");
    await f.harness.runPass(context);
    expect(f.starts).toHaveLength(1);
    expect(f.calls.filter((method) => method === "cancel")).toHaveLength(2);
    expect(f.calls.filter((method) => method === "acknowledge")).toHaveLength(1);
  });
  it("cancelling a pending run settles it from the canonical receipt and stops pulling", async () => {
    const f = await fixture();
    await f.root.abort(context);
    expect(f.calls.filter((method) => method === "cancel")).toHaveLength(1);
    const admission = await retainedEvalAdmission(f.harness, f.runId(), context);
    expect(admission?.outcome).toMatchObject({ runDigest: "b".repeat(64) });
    const awaited = await f.harness.waitForTask(admission!.awaiting!, context);
    expect(["completed", "aborted"]).toContain(awaited.state.outcome.status);
    await f.harness.waitForTask(admission!.acknowledgement!, context);
    expect(f.calls.filter((method) => method === "acknowledge")).toHaveLength(1);
  });
  it("consumes an already terminal result without losing its independently owned acknowledgement", async () => {
    const f = await fixture({ fastResult: true });
    expect(await f.submission.wait(context)).toMatchObject({ status: "done" });
    await f.harness.runPass(context);
    expect(f.starts).toHaveLength(1);
    // A run that is terminal at its first read never needs the await task.
    expect(
      (await retainedEvalAdmission(f.harness, f.runId(), context))?.awaiting,
    ).toBeNull();
    expect(f.calls.filter((method) => method === "acknowledge")).toHaveLength(1);
  });
});
