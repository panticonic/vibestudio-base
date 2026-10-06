import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { openNodeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";
import { afterEach, describe, expect, it } from "vitest";
import {
  createModels,
  createAssistantMessageEventStream,
  fauxAssistantMessage,
  fauxProvider,
  type AssistantMessage,
  type AssistantMessageEventStream,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  Harness,
  MemoryStorage,
  createRegistry,
  type ModelRequestTarget,
  type Storage,
} from "@panticonic/pi-durable";
import type { NativeModelStream } from "@workspace/agentic-protocol";
import { observeNativeModelStream } from "./native-model-stream.js";
const context = BACKGROUND_CONTEXT;
function gate<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const sessions: Harness[] = [];
const directories: string[] = [];
const releases: (() => void)[] = [];
afterEach(async () => {
  for (const release of releases.splice(0)) release();
  const results = await Promise.allSettled(
    sessions.splice(0).map((h) => h.close(context)),
  );
  const cleanup = await Promise.allSettled(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
  for (const r of [...results, ...cleanup])
    if (r.status === "rejected") throw r.reason;
});
async function fixture(
  options: {
    storage?: Storage;
    send?: (
      value: NativeModelStream,
      ctx: Parameters<typeof observeNativeModelStream>[1],
    ) => Promise<void>;
  } = {},
) {
  const faux = fauxProvider();
  const models = createModels();
  const started = gate<{
    stream: AssistantMessageEventStream;
    signal: AbortSignal;
  }>();
  let current!: AssistantMessageEventStream;
  models.setProvider({
    ...faux.provider,
    streamSimple: (_model, _prompt, opts) => {
      current = createAssistantMessageEventStream();
      const signal = opts?.signal;
      if (!signal) throw new Error("Native provider signal missing");
      signal.addEventListener(
        "abort",
        () =>
          current.push({
            type: "error",
            reason: "aborted",
            error: fauxAssistantMessage("", {
              stopReason: "aborted",
              errorMessage: "Original provider cancelled",
            }),
          }),
        { once: true },
      );
      started.resolve({ stream: current, signal });
      return current;
    },
  });
  let partialObserved: ReturnType<typeof gate<void>> | undefined;
  const errorsObserved = gate();
  const values: NativeModelStream[] = [];
  const errors: unknown[] = [];
  let closes = 0;
  let request!: ModelRequestTarget;
  const opened = gate();
  const h = await Harness.open(
    options.storage ?? new MemoryStorage(),
    {
      models,
      registry: createRegistry(),
      publishWake: async () => {},
      modelRequests: async (target, _api, ctx) => {
        request = target;
        const result = await observeNativeModelStream(
          {
            harness: h,
            request: target,
            connection: {
              status: "ready",
              options: {},
              close: async () => {
                closes++;
              },
            },
            send: async (value, sendContext) => {
              values.push(value);
              if (value.message) partialObserved?.resolve();
              await options.send?.(value, sendContext);
            },
            report: (e) => {
              errors.push(e);
              errorsObserved.resolve();
            },
          },
          ctx,
        );
        opened.resolve();
        return result;
      },
    },
    context,
  );
  sessions.push(h);
  const c = await h.root(context, {
    agent: { model: { provider: "faux", modelId: faux.getModel().id } },
  });
  return {
    h,
    c,
    values,
    errors,
    errorsObserved,
    started,
    opened,
    request: () => request,
    closes: () => closes,
    pass: () => {
      const pass = h.runPass(context);
      void pass.catch(() => {});
      return pass;
    },
    partial: async (text: string) => {
      partialObserved = gate();
      const partial = fauxAssistantMessage(text);
      current.push({
        type: "text_delta",
        contentIndex: 0,
        delta: text,
        partial,
      });
      await partialObserved.promise;
      return partial;
    },
    finish: (
      message: AssistantMessage = fauxAssistantMessage("canonical final"),
    ) =>
      current.push({
        type: "done",
        reason: message.stopReason === "toolUse" ? "toolUse" : "stop",
        message,
      }),
  };
}
describe("native model stream observation", () => {
  it("shows readiness and exact committed replacement partials, then joins clearing before canonical answer acceptance", async () => {
    const f = await fixture();
    await f.c.submit({ type: "input", content: "actual input" }, context);
    const pass = f.pass();
    await f.started.promise;
    await f.opened.promise;
    expect(f.values[0]).toMatchObject({
      phase: "running",
      message: null,
      taskId: f.request().taskId,
      attempt: 1,
      cutoff: f.request().cutoff,
    });
    await f.partial("first");
    await f.partial("replacement");
    expect(
      f.values
        .filter((v) => v.message !== null)
        .map((v) => (v.message!.content[0] as { text: string }).text),
    ).toEqual(["first", "replacement"]);
    f.finish();
    await pass;
    await f.h.waitForIdle(context);
    expect(f.values.at(-1)).toMatchObject({ phase: "cleared", message: null });
    expect(f.closes()).toBe(1);
    const entries = await f.c.entries({}, 100, undefined, context);
    expect(
      entries.items
        .flatMap((e) => e.model ?? [])
        .filter((m) => m.role === "assistant"),
    ).toEqual([
      expect.objectContaining({
        content: [{ type: "text", text: "canonical final" }],
      }),
    ]);
  });
  it("aborts and joins an in-flight observation before releasing its real provider connection", async () => {
    const entered = gate();
    const aborted = gate();
    const joined = gate();
    releases.push(() => joined.resolve());
    const f = await fixture({
      send: async (value, ctx) => {
        if (!value.message) return;
        entered.resolve();
        await new Promise<void>((resolve) => {
          ctx.abortSignal!.addEventListener(
            "abort",
            () => {
              aborted.resolve();
              resolve();
            },
            { once: true },
          );
        });
        await joined.promise;
      },
    });
    await f.c.submit({ type: "input", content: "held observation" }, context);
    const pass = f.pass();
    await f.started.promise;
    await f.partial("owned partial");
    await entered.promise;
    f.finish();
    await aborted.promise;
    expect(f.closes()).toBe(0);
    joined.resolve();
    await pass;
    await f.h.waitForIdle(context);
    expect(f.closes()).toBe(1);
    expect(f.errors).toEqual([]);
    expect(f.values.at(-1)?.phase).toBe("cleared");
  });
  it("reports original signal disconnect while preserving actual provider completion and canonical answer", async () => {
    const original = new Error("Original observer transport disconnected");
    const f = await fixture({
      send: async (value) => {
        if (value.message) throw original;
      },
    });
    await f.c.submit(
      { type: "input", content: "still owned provider" },
      context,
    );
    const pass = f.pass();
    await f.started.promise;
    await f.partial("partial before disconnect");
    await f.errorsObserved.promise;
    expect(f.errors).toEqual([original]);
    f.finish();
    await pass;
    await f.h.waitForIdle(context);
    expect(f.closes()).toBe(1);
    expect(f.values.filter((v) => v.message)).toHaveLength(1);
    const entries = await f.c.entries({}, 100, undefined, context);
    expect(
      entries.items
        .flatMap((e) => e.model ?? [])
        .some(
          (m) =>
            m.role === "assistant" &&
            m.content.some(
              (b) => b.type === "text" && b.text === "canonical final",
            ),
        ),
    ).toBe(true);
  });
  it("clears a genuinely cancelled provider without treating UI observation as the cancellation owner", async () => {
    const f = await fixture();
    await f.c.submit({ type: "input", content: "cancel actual run" }, context);
    const pass = f.pass();
    const { signal } = await f.started.promise;
    await f.partial("cancelled partial");
    await f.h.abortTask(f.request().taskId, context);
    await pass;
    await f.h.waitForIdle(context);
    expect(signal.aborted).toBe(true);
    expect(f.values.at(-1)?.phase).toBe("cleared");
    expect(f.closes()).toBe(1);
    expect(
      (await f.h.waitForTask(f.request().taskId, context)).state.outcome.status,
    ).toBe("aborted");
  });
  it("reacquires from the same retained native request after close and does not revive its old observation", async () => {
    const scratch = join(
      process.env["VIBESTUDIO_HOST_ROOT"]!,
      ".cache/native-stream-tests",
    );
    await mkdir(scratch, { recursive: true });
    const directory = await mkdtemp(join(scratch, "session-"));
    directories.push(directory);
    const filename = join(directory, "session.sqlite");
    const first = await fixture({
      storage: await openNodeSqliteStorage(filename),
    });
    await first.c.submit({ type: "input", content: "retained input" }, context);
    const pass = first.pass().then(
      () => null,
      (error) => error as Error,
    );
    await first.started.promise;
    await first.partial("retained partial");
    const original = first.request();
    await first.h.close(context);
    expect((await pass)?.message).toBe("Harness is closed");
    const count = first.values.length;
    const second = await fixture({
      storage: await openNodeSqliteStorage(filename),
    });
    const reopened = second.pass();
    await second.started.promise;
    expect(second.request()).toMatchObject({
      taskId: original.taskId,
      conversationId: original.conversationId,
      cutoff: original.cutoff,
      attempt: original.attempt,
    });
    expect(second.values[0]?.frontier).toBeGreaterThan(original.cutoff);
    await second.partial("actual resumed partial");
    second.finish();
    await reopened;
    await second.h.waitForIdle(context);
    expect(first.values).toHaveLength(count);
    expect(second.values.at(-1)?.phase).toBe("cleared");
    expect(first.closes()).toBe(1);
    expect(second.closes()).toBe(1);
  });
  it("joins observation clearing while retaining an original provider error in the canonical response", async () => {
    const f = await fixture();
    await f.c.submit({ type: "input", content: "provider error" }, context);
    const pass = f.pass();
    const { stream } = await f.started.promise;
    await f.partial("partial before original error");
    stream.push({
      type: "error",
      reason: "error",
      error: fauxAssistantMessage("", {
        stopReason: "error",
        errorMessage: "Original provider refusal",
      }),
    });
    await pass;
    await f.h.waitForIdle(context);
    expect(f.closes()).toBe(1);
    expect(f.values.at(-1)?.phase).toBe("cleared");
    const entries = await f.c.entries({}, 100, undefined, context);
    expect(
      entries.items
        .flatMap((e) => e.model ?? [])
        .filter((m) => m.role === "assistant"),
    ).toEqual([
      expect.objectContaining({
        stopReason: "error",
        errorMessage: "Original provider refusal",
      }),
    ]);
  });
});
