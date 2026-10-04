import { describe, expect, it, vi } from "vitest";
import type { Context } from "@panticonic/pi-chord";
import { Type, createModels, fauxProvider, fauxAssistantMessage, fauxToolCall } from "@panticonic/pi-ai";
import { Harness, MemoryStorage, createRegistry, defineExtension, type ToolRegistration, type ToolExecutionApi } from "@panticonic/pi-durable";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import { authorNativeTool } from "./native-tool-authoring.js";
import { executeTool, nativeToolApi, nativeToolContext } from "./testing/native-tool.js";

const parameters = Type.Object({ value: Type.String() });

describe("native tool authoring", () => {
  it("orders stateful calls in one real Pi batch while explicitly parallel reads overlap", async () => {
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    const registry = createRegistry();
    let head = 0;
    let reads = 0;
    let releaseReads!: () => void;
    const bothReads = new Promise<void>((resolve) => { releaseReads = resolve; });
    const mutations: number[] = [];
    const tool = (name: string, parallel: boolean) => authorNativeTool(
      (): ToolRegistration => ({
        name, description: name, parameters: Type.Object({}),
        ...(parallel ? { executionMode: "parallel" as const } : {}),
        execute: async (_args, _api, context) => {
          if (parallel) {
            if (++reads === 2) releaseReads();
            await new Promise<void>((resolve, reject) => {
              const signal = context.abortSignal;
              const abort = () => reject(signal?.reason);
              if (signal?.aborted) return abort();
              signal?.addEventListener("abort", abort, { once: true });
              bothReads.then(resolve, reject).finally(() => signal?.removeEventListener("abort", abort));
            });
            return { details: { head } };
          }
          const observed = head;
          await Promise.resolve();
          if (head !== observed) throw new Error("Workspace context changed");
          mutations.push(++head);
          return { details: { head } };
        },
      }),
      async () => undefined,
    );
    const tools = [tool("read_one", true), tool("read_two", true), tool("move", false), tool("copy", false)];
    registry.install(defineExtension({ name: "workspace-tools", tools }));
    faux.setResponses([
      fauxAssistantMessage(tools.map((t) => fauxToolCall(t.name, {})), { stopReason: "toolUse" }),
      fauxAssistantMessage("Transfers complete."),
    ]);
    const context = BACKGROUND_CONTEXT;
    const harness = await Harness.open(new MemoryStorage(), { models, registry }, context);
    try {
      const root = await harness.root(context, { agent: { model: { provider: "faux", modelId: "faux-1" }, tools } });
      const result = await (await root.submit({ type: "input", content: "Move and copy." }, context)).wait(context);
      expect(result.status).toBe("done");
      expect(reads).toBe(2);
      expect(mutations).toEqual([1, 2]);
      const entries = await root.entries({}, 100, undefined, context);
      const results = entries.items.flatMap((entry) => entry.model ?? [])
        .filter((message) => message.role === "toolResult");
      expect(results).toHaveLength(4);
      expect(results.every((message) => !message.isError)).toBe(true);
    } finally {
      await harness.close(context);
    }
  });
  it("retains the selected resource and schema while binding each actual invocation independently", async () => {
    let configuration = "panel:first";
    const selected = configuration;
    const calls: string[] = [];
    const bind = vi.fn(async (api: ToolExecutionApi) => api.callId as string);
    const tool = authorNativeTool(
      (invocation: string | undefined): ToolRegistration<typeof parameters, { resource: string; invocation: string }> => ({
        name: "selected", description: selected, parameters,
        execute: async ({ value }) => {
          if (!invocation) throw new Error("Missing bound invocation");
          calls.push(`${selected}:${invocation}:${value}`);
          return { details: { resource: selected, invocation } };
        },
      }),
      bind,
    );
    configuration = "panel:later";
    const results = await Promise.all([
      executeTool(tool, { value: "a" }, { callId: "call:a" }),
      executeTool(tool, { value: "b" }, { callId: "call:b" }),
    ]);
    expect(tool.parameters).toBe(parameters);
    expect(tool.description).toBe("panel:first");
    expect(configuration).toBe("panel:later");
    expect(calls).toEqual(["panel:first:call:a:a", "panel:first:call:b:b"]);
    expect(results.map((result) => result.details)).toEqual([
      { resource: "panel:first", invocation: "call:a" },
      { resource: "panel:first", invocation: "call:b" },
    ]);
    expect(bind).toHaveBeenCalledTimes(2);
    expect(tool.replay).toBeUndefined();
  });

  it("forwards native waits and cancellation with the exact API and cleanup context", async () => {
    const wait = { wait: { kind: "receipt" as const, key: "owned", binding: "exact" }, continuation: { operation: "existing" } };
    const api = { ...nativeToolApi(), continuation: { operation: "existing" } };
    const context = nativeToolContext();
    const execute = vi.fn(async () => wait);
    const cancel = vi.fn(async () => ({ content: [{ type: "text" as const, text: "cancelled" }] }));
    const bind = vi.fn(async (actualApi: ToolExecutionApi, actualContext: Context) => {
      expect(actualApi).toBe(api); expect(actualContext).toBe(context);
      return "retained invocation";
    });
    const tool = authorNativeTool(
      (): ToolRegistration<typeof parameters> => ({ name: "owned", description: "owned", parameters, execute, cancel }),
      bind,
    );
    const args = { value: "same" };
    expect(await tool.execute(args, api, context)).toBe(wait);
    await tool.cancel!(args, api, context);
    expect(execute).toHaveBeenCalledWith(args, api, context);
    expect(cancel).toHaveBeenCalledWith(args, api, context);
    expect(bind).toHaveBeenCalledTimes(2);
  });

  it("propagates the original binding failure before any tool operation", async () => {
    const failure = new Error("source rejected");
    const execute = vi.fn(async () => ({}));
    const tool = authorNativeTool(
      (): ToolRegistration<typeof parameters> => ({ name: "exact", description: "exact", parameters, execute }),
      async () => { throw failure; },
    );
    await expect(executeTool(tool, { value: "a" })).rejects.toBe(failure);
    expect(execute).not.toHaveBeenCalled();
  });
});
