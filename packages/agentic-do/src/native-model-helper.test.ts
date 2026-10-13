import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  Type,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  defineExtension,
  Harness,
  MemoryStorage,
  type ModelRequestPort,
  type ModelRequestTarget,
} from "@panticonic/pi-durable";
import {
  completeNativeModelHelper,
  NativeModelHelperTask,
} from "./native-model-helper.js";

const context = BACKGROUND_CONTEXT;
const sessions: Harness[] = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((h) => h.close(context)));
});
function latch<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function fixture(port: ModelRequestPort) {
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage("helper answer")]);
  const models = createModels();
  models.setProvider(faux.provider);
  const registry = createRegistry();
  registry.install(
    defineExtension({ name: "helpers", tasks: [NativeModelHelperTask] }),
  );
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry, modelRequests: port },
    context,
  );
  sessions.push(harness);
  const conversation = await harness.root(context);
  const transcript = {
    systemPrompt: "Only write the reply",
    messages: [{ role: "user" as const, content: "An email", timestamp: 10 }],
  };
  const complete = vi.spyOn(models, "complete");
  return {
    harness,
    conversation,
    transcript,
    registry,
    model: faux.getModel(),
    complete,
  };
}

describe("native one-shot model task", () => {
  it("binds a real native task and preserves the selected transcript/options while joining release", async () => {
    const requests: ModelRequestTarget[] = [];
    const closed = vi.fn(async () => {});
    const f = await fixture(async (request) => {
      requests.push(request);
      return {
        status: "ready",
        options: { apiKey: "protected" },
        close: closed,
      };
    });
    const result = await completeNativeModelHelper(
      f.harness,
      f.conversation,
      f.model,
      f.transcript,
      { temperature: 0.2, maxTokens: 300 },
      context,
    );
    expect(result.content).toEqual([{ type: "text", text: "helper answer" }]);
    expect(requests[0]).toMatchObject({
      taskKind: "vibestudio.model-helper",
      conversationId: f.conversation.id,
      purpose: "generation",
      operation: "complete",
      model: JSON.parse(JSON.stringify(f.model)),
      messages: f.transcript.messages,
      options: { maxTokens: 300 },
    });
    expect(f.complete).toHaveBeenCalledWith(
      JSON.parse(JSON.stringify(f.model)),
      f.transcript,
      expect.objectContaining({
        apiKey: "protected",
        temperature: 0.2,
        maxTokens: 300,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(closed).toHaveBeenCalledTimes(1);
    expect(
      (await f.harness.getTask(requests[0]!.taskId, context))?.state.status,
    ).toBe("terminal");
  });

  it("parks on the original readiness condition and resumes the same task after connection", async () => {
    const entered = latch<ModelRequestTarget>();
    const requests: ModelRequestTarget[] = [];
    let connected = false;
    const f = await fixture(async (request) => {
      requests.push(request);
      if (!connected) {
        entered.resolve(request);
        return {
          status: "waiting",
          condition: {
            kind: "input",
            conversationId: request.conversationId,
            after: request.cutoff,
            kinds: ["credential-connected"],
          },
        };
      }
      return { status: "ready", options: {}, close: async () => {} };
    });
    const pending = completeNativeModelHelper(
      f.harness,
      f.conversation,
      f.model,
      f.transcript,
      {},
      context,
    );
    const original = await entered.promise;
    expect(f.complete).not.toHaveBeenCalled();
    connected = true;
    await f.conversation.submit(
      { type: "write", entry: { kind: "credential-connected" } },
      context,
    );
    expect((await pending).content).toEqual([
      { type: "text", text: "helper answer" },
    ]);
    expect(requests.map((r) => r.taskId)).toEqual([
      original.taskId,
      original.taskId,
    ]);
  });

  it("cancels and joins dispatch plus transport before rejecting the caller", async () => {
    const dispatched = latch<void>();
    const released = latch<void>();
    const closed = vi.fn(async () => {
      await released.promise;
    });
    const f = await fixture(async () => ({
      status: "ready",
      options: {},
      close: closed,
    }));
    f.complete.mockImplementation(async (_model, _transcript, options) => {
      dispatched.resolve();
      return new Promise((_resolve, reject) => {
        options!.signal!.addEventListener(
          "abort",
          () => reject(options!.signal!.reason),
          { once: true },
        );
      });
    });
    const controller = new AbortController();
    const reason = new Error("caller cancelled");
    const pending = completeNativeModelHelper(
      f.harness,
      f.conversation,
      f.model,
      f.transcript,
      {},
      { ...context, abortSignal: controller.signal },
    );
    const settled = vi.fn();
    void pending.then(settled, settled);
    await dispatched.promise;
    controller.abort(reason);
    // Joining the exact dispatch-owned release is required even after caller abort.
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(settled).not.toHaveBeenCalled();
    released.resolve();
    await expect(pending).rejects.toBe(reason);
    expect(closed).toHaveBeenCalledTimes(1);
    expect((await f.harness.inspect(context)).tasks).toEqual([]);
  });

  it("runs as a child of an executing native tool without waiting for its parent to end", async () => {
    let child!: ModelRequestTarget;
    const f = await fixture(async (request) => {
      child = request;
      return { status: "ready", options: {}, close: async () => {} };
    });
    let parentId = 0;
    const tool = {
      name: "draft",
      version: 1,
      description: "Draft",
      parameters: Type.Object({}),
      execute: async (
        _args: unknown,
        api: import("@panticonic/pi-durable").ToolExecutionApi,
        callContext: typeof context,
      ) => {
        parentId = api.taskId;
        const result = await completeNativeModelHelper(
          f.harness,
          f.conversation,
          f.model,
          f.transcript,
          {},
          callContext,
          api,
        );
        return {
          output: result.content.filter(
            (block): block is import("@panticonic/pi-ai").TextContent =>
              block.type === "text",
          ),
        };
      },
    };
    const extension = defineExtension({ name: "draft-tool", tools: [tool] });
    f.registry.install(extension);
    await f.conversation.configure(
      { extensions: [extension], tools: [tool] },
      context,
    );
    const taskId = await f.conversation.invokeTool(
      { id: "draft-call", name: "draft", arguments: {} },
      context,
    );
    const result = await f.harness.waitForTask(taskId, context);
    expect(result.state.outcome.status).toBe("completed");
    expect((await f.harness.getTask(child.taskId, context))?.owner).toBe(
      parentId,
    );
  });

  it("reports a provider error response as the original failed model invocation", async () => {
    const f = await fixture(async () => ({
      status: "ready",
      options: {},
      close: async () => {},
    }));
    f.complete.mockResolvedValue(
      fauxAssistantMessage("", {
        stopReason: "error",
        errorMessage: "provider refused the request",
      }),
    );
    await expect(
      completeNativeModelHelper(
        f.harness,
        f.conversation,
        f.model,
        f.transcript,
        {},
        context,
      ),
    ).rejects.toMatchObject({
      message: "provider refused the request",
      cause: {
        message: "provider refused the request",
        detail: { stopReason: "error" },
      },
    });
  });

  it("propagates the original provider-port failure and retires the failed task", async () => {
    const failure = new Error("native authority rejection");
    const f = await fixture(async () => {
      throw failure;
    });
    await expect(
      completeNativeModelHelper(
        f.harness,
        f.conversation,
        f.model,
        f.transcript,
        {},
        context,
      ),
    ).rejects.toMatchObject({
      message: failure.message,
      cause: { message: failure.message },
    });
    expect(f.complete).not.toHaveBeenCalled();
    expect((await f.harness.inspect(context)).tasks).toEqual([]);
  });
});
