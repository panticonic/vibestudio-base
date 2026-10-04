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
  acceptReceipt,
  bindReceipt,
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
  MemoryStorage,
  type Conversation,
  type ModelRequestPort,
} from "@panticonic/pi-durable";
import {
  createNativeProductModelPolicy,
  nativeProductStream,
  type NativeProductModelSettings,
} from "./native-product-model-policy.js";
import {
  prepareNativeProductContexts,
  recordNativeProductInput,
} from "./native-product-context.js";

const context = BACKGROUND_CONTEXT;
const sessions: Harness[] = [];
afterEach(async () => {
  await Promise.all(
    sessions.splice(0).map((session) => session.close(context)),
  );
});
const settings: NativeProductModelSettings = {
  primaryModel: { provider: "faux", modelId: "primary" },
  fallbackModel: { provider: "faux", modelId: "fallback" },
  fallbackScope: "unattended",
  fallbackOn: ["auth_or_credentials"],
  fastMode: false,
};
async function fixture() {
  const faux = fauxProvider({
    models: [{ id: "primary" }, { id: "fallback" }, { id: "changed" }],
  });
  const models = createModels();
  models.setProvider(faux.provider);
  const registry = createRegistry();
  const policy = createNativeProductModelPolicy();
  const echo = defineTool({
    name: "echo",
    description: "Actual effect",
    parameters: Type.Object({ text: Type.String() }),
    execute: async (args) => ({ content: [{ type: "text", text: args.text }] }),
  });
  registry.install(
    defineExtension({
      name: "policy",
      hooks: [policy.generationHooks],
      tools: [echo],
    }),
  );
  let blocked = false;
  const port: ModelRequestPort = async (_request, api, ctx) => {
    if (!blocked)
      return { status: "ready", options: {}, close: async () => {} };
    await api.commit(
      (tx) => bindReceipt(tx, "test:credential", "original"),
      ctx,
    );
    return {
      status: "waiting",
      condition: {
        kind: "receipt",
        key: "test:credential",
        binding: "original",
      },
    };
  };
  const harness = await Harness.open(
    new MemoryStorage(),
    {
      models,
      registry,
      modelRequests: port,
      settings: { retry: { enabled: false } },
      publishWake: async () => {},
      prepareCommit: async (tx, staged) => {
        await prepareNativeProductContexts(tx, staged);
        await policy.prepareCommit(tx, staged);
      },
    },
    context,
  );
  sessions.push(harness);
  const conversation = await harness.root(context, {
    agent: { model: settings.primaryModel, tools: [echo] },
    init: (tx, id) => policy.configure(tx, id, settings),
  });
  async function submit(
    origin?: "scheduled" | "agent-initiated",
    target: Conversation = conversation,
  ) {
    return target.submit(
      {
        type: "input",
        content: async (tx, id) => {
          await recordNativeProductInput(
            tx,
            id,
            "channel:one",
            origin ? { origin } : undefined,
          );
          return "Actual original input";
        },
      },
      context,
    );
  }
  return {
    faux,
    harness,
    conversation,
    policy,
    submit,
    block: () => {
      blocked = true;
    },
    release: async () => {
      blocked = false;
      await harness.commit(
        (tx) => acceptReceipt(tx, "test:credential", "original", true),
        context,
      );
    },
  };
}
const failure = () =>
  fauxAssistantMessage("", {
    stopReason: "error",
    errorMessage:
      '{"error":{"code":"invalid_api_key","message":"Invalid API key"}}',
  });
describe("native original product model policy", () => {
  it("pins original fallback across credential wait and settings edits, retains it through tools, and selects current settings only for fresh input", async () => {
    const f = await fixture();
    const calls: string[] = [];
    f.faux.setResponses([
      (_messages, _options, _state, model) => {
        calls.push(model.id);
        return failure();
      },
      (_messages, _options, _state, model) => {
        calls.push(model.id);
        return fauxAssistantMessage(
          fauxToolCall("echo", { text: "real tool" }, { id: "actual:tool" }),
          { stopReason: "toolUse" },
        );
      },
      (_messages, _options, _state, model) => {
        calls.push(model.id);
        return fauxAssistantMessage("Original fallback answer");
      },
      (_messages, _options, _state, model) => {
        calls.push(model.id);
        return failure();
      },
      (_messages, _options, _state, model) => {
        calls.push(model.id);
        return fauxAssistantMessage("Fresh fallback answer");
      },
    ]);
    f.block();
    const original = await f.submit("scheduled");
    await f.harness.runPass(context);
    await f.conversation.commit(
      (tx) =>
        f.policy.configure(tx, f.conversation.id, {
          ...settings,
          fallbackModel: { provider: "faux", modelId: "changed" },
        }),
      context,
    );
    await f.release();
    expect((await original.wait(context)).status).toBe("done");
    expect((await (await f.submit("scheduled")).wait(context)).status).toBe(
      "done",
    );
    expect(calls).toEqual([
      "primary",
      "fallback",
      "fallback",
      "primary",
      "changed",
    ]);
  });
  for (const origin of [undefined, "agent-initiated"] as const)
    it(`keeps ${origin ?? "user"} input out of unattended fallback`, async () => {
      const f = await fixture();
      f.faux.setResponses([failure()]);
      const original = await f.submit(origin);
      expect(await original.wait(context)).toMatchObject({
        status: "unanswered",
        reason: "model_error",
      });
      expect(f.faux.state.callCount).toBe(1);
    });
  it("does not repeat fallback after its own real error or select it after actual cancellation", async () => {
    const f = await fixture();
    f.faux.setResponses([failure(), failure()]);
    const original = await f.submit("scheduled");
    expect((await original.wait(context)).status).toBe("unanswered");
    expect(f.faux.state.callCount).toBe(2);
    f.faux.setResponses([
      fauxAssistantMessage("", {
        stopReason: "aborted",
        errorMessage: "Original request cancelled",
      }),
    ]);
    expect((await (await f.submit("scheduled")).wait(context)).status).toBe(
      "unanswered",
    );
    expect(f.faux.state.callCount).toBe(3);
  });
  it("uses only actual advertised model service tiers", () => {
    expect(nativeProductStream("openai-codex", "gpt-6-sol", true)).toEqual({
      serviceTier: "priority",
    });
    expect(nativeProductStream("openai-codex", "unadvertised", true)).toEqual(
      {},
    );
    expect(nativeProductStream("anthropic", "gpt-6-sol", true)).toEqual({});
    expect(nativeProductStream("openai-codex", "gpt-6-sol", false)).toEqual({});
  });
});
