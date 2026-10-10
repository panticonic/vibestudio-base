import { createMainRpcCaller } from "@vibestudio/service-schemas/mainRpc";
import { schemaRpcClientMock } from "@vibestudio/rpc/test-utils";
import { RemoteRpcError } from "@vibestudio/rpc";
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
import { MemoryStorage } from "@panticonic/pi-durable";
import type { RpcClient } from "@vibestudio/rpc";
import type { EvalResultReceipt } from "@vibestudio/service-schemas/eval";
import { createEvalTool } from "@workspace/harness/tools/eval";
import { createNativeEvalExecution } from "./native-eval-tool.js";
import {
  createNativeEvalAcknowledgements,
  consumeEvalReceipt,
  retainedEvalAdmission,
} from "./native-eval-receipts.js";
import { bindNativeToolInvocation } from "./native-invocation-boundary.js";
import {
  openBoundAgentSession,
  type AgentHostCall,
} from "./native-agent-session.js";
const context = BACKGROUND_CONTEXT;
const sessions: Harness[] = [];
afterEach(async () => {
  await Promise.all(
    sessions.splice(0).map((session) => session.close(context)),
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
async function fixture(
  options: {
    loseStart?: boolean;
    failCancelRead?: boolean;
    fastResult?: boolean;
    imageResult?: boolean;
    rejectStart?: Error;
    rejectAfterLostStart?: Error;
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
  const publications: unknown[] = [];
  const calls: string[] = [];
  const terminal = (cancelled = false): EvalResultReceipt => ({
    runId,
    runDigest: "b".repeat(64),
    resultDigest: "c".repeat(64),
    result: cancelled
      ? {
          success: false,
          console: "",
          failureKind: "cancelled",
          error: "actual canonical cancellation",
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
  const wireCall = async (
    method: string,
    args: unknown[],
  ): Promise<unknown> => {
    calls.push(method);
    if (method === "blobstore.getBase64") {
      expect(args).toEqual(["a".repeat(64)]);
      return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
    }
    if (method === "eval.start") {
      starts.push(args[0]);
      runId = (args[0] as { runId: string }).runId;
      if (options.rejectStart) throw options.rejectStart;
      if (options.fastResult) receipt = terminal();
      if (loseStart) {
        loseStart = false;
        throw original;
      }
      if (options.rejectAfterLostStart) throw options.rejectAfterLostStart;
      return {
        runId,
        runDigest: "b".repeat(64),
        authorityManifestDigest: "d".repeat(64),
        status: receipt ? "terminal" : "accepted",
        ...(receipt
          ? { snapshot: { status: "done", result: receipt.result } }
          : {}),
      };
    }
    if (method === "eval.cancel") {
      receipt = terminal(true);
      return { ok: true, forcedReset: false };
    }
    if (method === "eval.receipt") {
      if (receipt?.result.failureKind === "cancelled" && failRead)
        throw cleanup;
      return receipt;
    }
    if (method === "eval.acknowledge") {
      expect(args[0]).toMatchObject({
        runId,
        receipt: { runDigest: "b".repeat(64), resultDigest: "c".repeat(64) },
      });
      return { acknowledged: true, duplicate: false };
    }
    throw Error(`unexpected service ${method}`);
  };
  const rpc: RpcClient = schemaRpcClientMock(
    {
      call: (
        _target: Parameters<RpcClient["call"]>[0],
        method: string,
        args: unknown[],
      ) => wireCall(method, args),
      stream: () => {
        throw Error("unexpected stream");
      },
    },
    owner.runtimeId,
  );
  const callHost: AgentHostCall = createMainRpcCaller(
    schemaRpcClientMock({ call: async () => entity }, owner.runtimeId),
  );
  const call = createMainRpcCaller(rpc);
  const acknowledgements = createNativeEvalAcknowledgements(
    (method, args, context) =>
      call(method, args, { signal: context.abortSignal }),
  );
  const execution = createNativeEvalExecution({
    harness: () => harness,
    acknowledgements,
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
          callHost,
          rpc,
          publishStart: async (_channel, event) => {
            publications.push(event);
            return { id: 17 };
          },
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
      tasks: [acknowledgements.task],
    }),
  );
  harness = await openBoundAgentSession(
    new MemoryStorage(),
    owner,
    { models, registry, publishWake: async () => {} },
    context,
  );
  sessions.push(harness);
  const root = await harness.root(context, {
    agent: {
      model: { provider: "faux", modelId: faux.getModel().id },
      tools: [evalTool],
    },
  });
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
    harness,
    root,
    submission,
    taskId: () => taskId,
    runId: () => runId,
    starts,
    publications,
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
    expect(f.calls).toEqual(["eval.start"]);
    expect(
      await retainedEvalAdmission(f.harness, f.runId(), context),
    ).toMatchObject({ runDigest: "", outcome: null, acknowledgement: null });
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
      expect(f.calls).toEqual(["eval.start"]);
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
  it("parks pending domain work, consumes actual completion and acknowledges with one owned task", async () => {
    const f = await fixture();
    expect(f.starts).toHaveLength(1);
    expect(f.publications).toHaveLength(1);
    expect((await f.harness.getTask(f.taskId(), context))?.state).toMatchObject(
      { status: "waiting", condition: { kind: "receipt", key: f.runId() } },
    );
    f.complete();
    await consumeEvalReceipt(
      f.harness,
      f.harness,
      f.runId(),
      f.call,
      f.acknowledgements,
      context,
    );
    expect(await f.submission.wait(context)).toMatchObject({ status: "done" });
    expect(f.starts).toHaveLength(1);
    expect(
      f.calls.filter((method) => method === "eval.acknowledge"),
    ).toHaveLength(1);
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
    expect(f.calls.filter((method) => method === "eval.cancel")).toHaveLength(
      2,
    );
    expect(
      f.calls.filter((method) => method === "eval.acknowledge"),
    ).toHaveLength(1);
  });
  it("consumes an already terminal result without losing its independently owned acknowledgement", async () => {
    const f = await fixture({ fastResult: true });
    expect(await f.submission.wait(context)).toMatchObject({ status: "done" });
    await f.harness.runPass(context);
    expect(f.starts).toHaveLength(1);
    expect(
      f.calls.filter((method) => method === "eval.acknowledge"),
    ).toHaveLength(1);
  });
});
