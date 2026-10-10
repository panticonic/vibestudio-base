import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openNodeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";
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
  MemoryStorage,
  createRegistry,
  defineExtension,
  bindReceipt,
  acceptReceipt,
  type ModelRequestConnection,
  type Storage,
  type ToolRegistration,
} from "@panticonic/pi-durable";
import {
  observeNativeModelConnection,
  prepareNativeModelEvidence,
  readNativeChannelInspection,
  readNativeModelExecutionEvidence,
} from "./native-model-evidence.js";

import { prepareNativeProductContexts } from "./native-product-context.js";
import { AgentVesselBase } from "./agent-vessel.js";

const context = BACKGROUND_CONTEXT;
const sessions: Harness[] = [];
const scratch: string[] = [];
afterEach(async () => {
  const results = await Promise.allSettled(
    sessions.splice(0).map((session) => session.close(context)),
  );
  for (const result of results)
    if (result.status === "rejected") throw result.reason;
  for (const directory of scratch.splice(0))
    rmSync(directory, { recursive: true });
});
async function fixture(
  options: {
    storage?: Storage;
    tool?: ToolRegistration;
    payloadFailure?: Error;
    waiting?: boolean;
  } = {},
) {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const registry = createRegistry();
  if (options.tool)
    registry.install(
      defineExtension({ name: "owned-tool", tools: [options.tool] }),
    );
  let closes = 0;
  const received: unknown[] = [];
  const harness = await Harness.open(
    options.storage ?? new MemoryStorage(),
    {
      models,
      registry,
      publishWake: async () => {},
      prepareCommit: async (tx, staged, ctx) => {
        await prepareNativeProductContexts(tx, staged);
        await prepareNativeModelEvidence(tx, staged, ctx);
      },
      modelRequests: async (request, api, ctx) => {
        if (options.waiting) {
          await api.commit(
            (tx) => bindReceipt(tx, "credential", "credential-binding"),
            ctx,
          );
          return {
            status: "waiting",
            condition: {
              kind: "receipt",
              key: "credential",
              binding: "credential-binding",
            },
          };
        }
        await api.prepare(
          {
            ...request.model,
            baseUrl: "http://127.0.0.1:7341/native-endpoint",
          },
          ctx,
        );
        const connection: ModelRequestConnection = {
          status: "ready",
          options: {
            apiKey: "secret-test-only",
            authType: "oauth",
            onPayload: async (payload) => {
              if (options.payloadFailure) throw options.payloadFailure;
              return { ...(payload as object), prepared: true };
            },
          },
          close: async () => {
            closes++;
          },
        };
        return observeNativeModelConnection(request, api, connection, ctx);
      },
    },
    context,
  );
  sessions.push(harness);
  const conversation = await harness.root(context, {
    agent: {
      model: { provider: "faux", modelId: faux.getModel().id },
      ...(options.tool ? { tools: [options.tool] } : {}),
    },
  });
  // The actual test provider invokes its real request capabilities before producing a response.
  faux.setResponses([
    async (_prompt, options, _state, model) => {
      received.push(
        await options?.onPayload?.({ fixture: "actual-dispatch" }, model),
      );
      return fauxAssistantMessage("actual native answer");
    },
  ]);
  return { harness, conversation, faux, received, closes: () => closes };
}
describe("native model execution evidence", () => {
  it("reads retained model evidence from a cold vessel without dispatching another request", async () => {
    const directory = mkdtempSync(
      join(tmpdir(), "vibestudio-native-evidence-"),
    );
    scratch.push(directory);
    const path = join(directory, "execution.sqlite");
    const first = await fixture({ storage: await openNodeSqliteStorage(path) });
    await first.conversation.submit(
      { type: "input", content: "retain model proof" },
      context,
    );
    await first.harness.runPass(context);
    await first.harness.close(context);
    const replacement = await fixture({
      storage: await openNodeSqliteStorage(path),
    });
    let opens = 0;
    const reader = {
      existingAgentSession: () => undefined,
      restoreAgentSession: async () => {
        opens++;
        return replacement.harness;
      },
      admittedNativeChannelConversation: async (channel: string) => {
        expect(channel).toBe("retained-channel");
        return replacement.conversation;
      },
      hotPathTrace: () => null,
    };
    const evidence = await Reflect.apply(
      AgentVesselBase.prototype.getModelExecutionEvidence,
      reader,
      ["retained-channel"],
    );
    expect(evidence).toMatchObject({
      loaded: true,
      totalCalls: 1,
      calls: [
        expect.objectContaining({
          ref: "faux:faux-1",
          outcome: "completed",
          inputs: [
            expect.objectContaining({
              type: "input",
              status: "done",
              answer: expect.any(Number),
            }),
          ],
        }),
      ],
    });
    expect(opens).toBe(1);
    expect(replacement.faux.state.callCount).toBe(0);
  });
  it("joins actual dispatch, prepared route, response usage and authoritative task completion", async () => {
    const f = await fixture();
    await f.conversation.submit(
      { type: "input", content: "real native input" },
      context,
    );
    await f.harness.runPass(context);
    const inspect=vi.spyOn(f.harness,"inspect").mockRejectedValue(new Error("An owner-wide scheduling scan is not model evidence"));
    const evidence = await readNativeModelExecutionEvidence(
      f.harness,
      f.conversation.id,
      context,
    );
    expect(inspect).not.toHaveBeenCalled();
    inspect.mockRestore();
    expect(evidence.totalCalls).toBe(1);
    expect(evidence.truncated).toBe(false);
    expect(evidence.calls).toEqual([
      expect.objectContaining({
        provider: "faux",
        model: "faux-1",
        ref: "faux:faux-1",
        auth: "oauth",
        baseUrl: "http://127.0.0.1:7341/native-endpoint",
        outcome: "completed",
        original: expect.objectContaining({ baseUrl: "http://localhost:0/" }),
        native: expect.objectContaining({
          conversationId: f.conversation.id,
          purpose: "generation",
          attempt: 1,
        }),
        entryId: expect.any(Number),
        usage: expect.objectContaining({ totalTokens: expect.any(Number) }),
        task: { status: "terminal", outcome: "completed" },
        inputs: [
          expect.objectContaining({
            conversationId: f.conversation.id,
            type: "input",
            status: "done",
            answer: expect.any(Number),
          }),
        ],
      }),
    ]);
    expect(f.received).toEqual([
      { fixture: "actual-dispatch", prepared: true },
    ]);
    expect(f.closes()).toBe(1);
    expect(JSON.stringify(evidence)).not.toContain("secret-test-only");
    expect(JSON.stringify(evidence)).not.toContain("real native input");
    expect(
      Object.values(evidence.usage.models)[0]?.totalTokens,
    ).toBeGreaterThan(0);
  });
  it("does not count readiness preparation as model dispatch and reports actual waiting ownership", async () => {
    const f = await fixture({ waiting: true });
    await f.conversation.submit(
      { type: "input", content: "waiting input" },
      context,
    );
    await f.harness.runPass(context);
    expect(
      await readNativeModelExecutionEvidence(
        f.harness,
        f.conversation.id,
        context,
      ),
    ).toMatchObject({ totalCalls: 0, calls: [] });
    expect(
      await readNativeChannelInspection(f.harness, f.conversation.id, context),
    ).toMatchObject({
      tasks: [
        {
          record: expect.objectContaining({ kind: "pi.generation" }),
          state: expect.objectContaining({ kind: "waiting" }),
        },
      ],
      live: { run: expect.any(Object) },
    });
  });
  it("preserves original payload preparation failure without inventing a dispatched call", async () => {
    const original = new Error("original payload preparation failed");
    const f = await fixture({ payloadFailure: original });
    await f.conversation.submit(
      { type: "input", content: "failure input" },
      context,
    );
    await f.harness.runPass(context);
    const evidence = await readNativeModelExecutionEvidence(
      f.harness,
      f.conversation.id,
      context,
    );
    expect(evidence.calls).toEqual([]);
    expect(evidence.totalCalls).toBe(0);
    const entries = await f.conversation.entries({}, 100, undefined, context);
    expect(
      entries.items
        .flatMap((entry) => entry.model ?? [])
        .filter((message) => message.role === "assistant"),
    ).toEqual([
      expect.objectContaining({
        stopReason: "error",
        errorMessage: original.message,
      }),
    ]);
    expect(f.closes()).toBe(1);
  });
  it("distinguishes provider completion from generation waiting on its real owned tool", async () => {
    const tool: ToolRegistration = {
      name: "owned_wait",
      description: "Owned receipt",
      parameters: Type.Object({}),
      replay: "safe",
      execute: async (_args, api, ctx) => {
        if (api.continuation !== undefined)
          return { details: { joined: true }, control: { terminate: true } };
        await api.commit(
          (tx) => bindReceipt(tx, "tool-result", "tool-binding"),
          ctx,
        );
        return {
          wait: {
            kind: "receipt",
            key: "tool-result",
            binding: "tool-binding",
          },
          continuation: { owned: true },
        };
      },
      cancel: async () => ({
        details: { cancelled: true },
        control: { terminate: true },
      }),
    };
    const f = await fixture({ tool });
    f.faux.setResponses([
      async (_prompt, options, _state, model) => {
        await options?.onPayload?.({ fixture: "real-tool-round" }, model);
        return fauxAssistantMessage(fauxToolCall("owned_wait", {}), {
          stopReason: "toolUse",
        });
      },
    ]);
    await f.conversation.submit(
      { type: "input", content: "use owned tool" },
      context,
    );
    await f.harness.runPass(context);
    const before = await readNativeModelExecutionEvidence(
      f.harness,
      f.conversation.id,
      context,
    );
    expect(before.calls[0]).toMatchObject({
      outcome: "completed",
      task: { status: "waiting" },
    });
    await f.harness.commit(
      (tx) =>
        acceptReceipt(tx, "tool-result", "tool-binding", { joined: true }),
      context,
    );
    await f.harness.runPass(context);
    const after = await readNativeModelExecutionEvidence(
      f.harness,
      f.conversation.id,
      context,
    );
    expect(after.calls[0]).toMatchObject({
      outcome: "completed",
      task: { status: "terminal", outcome: "completed" },
    });
    expect(after.totalCalls).toBe(1);
  });
  it("retains original-input settlement through tool handover after both generations retire", async () => {
    const tool: ToolRegistration = {
      name: "echo",
      description: "Read-only echo",
      parameters: Type.Object({}),
      replay: "safe",
      execute: async () => ({ details: { echoed: true } }),
    };
    const f = await fixture({ tool });
    f.faux.setResponses([
      async (_prompt, options, _state, model) => {
        await options?.onPayload?.({ fixture: "tool-round" }, model);
        return fauxAssistantMessage(fauxToolCall("echo", {}), {
          stopReason: "toolUse",
        });
      },
      async (_prompt, options, _state, model) => {
        await options?.onPayload?.({ fixture: "final-round" }, model);
        return fauxAssistantMessage("Settled original input");
      },
    ]);
    const input = await f.conversation.submit(
      { type: "input", content: "perform a read" },
      context,
    );
    await f.harness.runPass(context);
    const settled = await input.wait(context);
    const evidence = await readNativeModelExecutionEvidence(
      f.harness,
      f.conversation.id,
      context,
    );
    expect(evidence.calls).toHaveLength(2);
    for (const call of evidence.calls) {
      expect(call.task).toEqual({ status: "terminal", outcome: "completed" });
      expect(call.inputs).toEqual([settled]);
    }
    expect(evidence.calls[0]!.entryId).not.toBe(settled.answer);
    expect(evidence.calls[1]!.entryId).toBe(settled.answer);
  });
  it("rejects inspection of an absent conversation", async () => {
    const f = await fixture();
    await expect(
      readNativeChannelInspection(
        f.harness,
        999 as typeof f.conversation.id,
        context,
      ),
    ).rejects.toThrow("no conversation");
  });
});
