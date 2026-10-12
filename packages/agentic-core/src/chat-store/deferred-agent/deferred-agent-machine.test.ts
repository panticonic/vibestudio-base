import { describe, expect, it, vi } from "vitest";
import type { Participant } from "@workspace/pubsub";
import { makeTestCatalogEntry } from "@workspace/model-catalog/testing";
import type { ModelCatalog } from "@workspace/model-catalog/catalog";
import type { AvailableAgent, ChatParticipantMetadata } from "../../types.js";
import { DeferredAgentMachine } from "./deferred-agent-machine.js";
import type { DeferredAgentInputs } from "./types.js";

const MODEL = "openai-codex:gpt-6.1-sol";
const AGENT: AvailableAgent = {
  id: "workers/agent-worker",
  className: "AiChatWorker",
  name: "AI Chat",
  proposedHandle: "ai-chat",
};
const CATALOG: ModelCatalog = {
  providers: [],
  models: [
    makeTestCatalogEntry({
      ref: MODEL,
      id: "gpt-6.1-sol",
      name: "GPT-6.1 Sol",
      provider: "openai-codex",
      baseUrl: "https://chatgpt.com/backend-api",
    }),
  ],
};
const AGENT_ROSTER = {
  "do:workers/agent-worker:AiChatWorker:ai-chat-1": {
    id: "do:workers/agent-worker:AiChatWorker:ai-chat-1",
    metadata: { name: "AI Chat", type: "agent", handle: "ai-chat" },
  },
} as unknown as Record<string, Participant<ChatParticipantMetadata>>;

function inputs(over: Partial<DeferredAgentInputs> = {}): DeferredAgentInputs {
  return {
    participants: {},
    pendingAgents: new Map(),
    input: "",
    clearComposer: vi.fn(),
    publishText: vi.fn().mockResolvedValue(undefined),
    maybeSetDefaultTitle: vi.fn(),
    coreSendMessage: vi.fn().mockResolvedValue(undefined),
    onAddAgent: vi.fn().mockResolvedValue(undefined),
    availableAgents: [AGENT],
    modelCatalog: null,
    defaultModelRef: null,
    firstAgentPending: true,
    resolveOpeningRequest: vi.fn().mockResolvedValue(undefined),
    channelName: "chat-test",
    replaySettled: true,
    ...over,
  };
}

function machineWith(over: Partial<DeferredAgentInputs> = {}) {
  const host = inputs(over);
  const machine = new DeferredAgentMachine(host);
  machine.reconcile();
  return { machine, host };
}

/** Let queued microtasks (spawn issue, publication settlement) run. */
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

describe("DeferredAgentMachine", () => {
  it("arms on the first send and spawns exactly once", async () => {
    const { machine, host } = machineWith({ input: "hello" });
    expect(machine.getSnapshot().deferredAgent?.setupActive).toBe(true);
    await machine.send();
    await settle();
    expect(host.clearComposer).toHaveBeenCalledTimes(1);
    expect(host.coreSendMessage).not.toHaveBeenCalled();
    expect(host.onAddAgent).toHaveBeenCalledTimes(1);
    expect(host.onAddAgent).toHaveBeenCalledWith(undefined, expect.not.objectContaining({ handle: expect.anything() }));
    expect(machine.getSnapshot().deferredAgent).toMatchObject({ launching: true, setupActive: false });

    await machine.send();
    machine.reconcile();
    await settle();
    expect(host.onAddAgent).toHaveBeenCalledTimes(1);
    expect(machine.getSnapshot().deferredAgent?.queued.map((item) => item.text)).toEqual([
      "hello",
      "hello",
    ]);
  });

  it("flushes per item on join and keeps a failure until retryDelivery", async () => {
    const { machine, host } = machineWith({ input: "first" });
    const publishText = host.publishText as ReturnType<typeof vi.fn>;
    publishText.mockRejectedValueOnce(new Error("Disconnected"));
    await machine.send();
    machine.setHostInputs({ input: "second" });
    await machine.send();
    machine.setHostInputs({ participants: AGENT_ROSTER, input: "" });
    machine.reconcile();
    await settle();
    expect(machine.getSnapshot().deferredAgent?.deliveryError).toBe("Disconnected");
    expect(publishText).toHaveBeenCalledTimes(1);
    // Reconciling again must not retry on its own.
    machine.reconcile();
    await settle();
    expect(publishText).toHaveBeenCalledTimes(1);

    const key = publishText.mock.calls[0]![1].idempotencyKey;
    machine.getSnapshot().deferredAgent!.retryDelivery();
    await settle();
    expect(publishText.mock.calls.map(([text]) => text)).toEqual(["first", "first", "second"]);
    expect(publishText.mock.calls[1]![1].idempotencyKey).toBe(key);
    expect(host.maybeSetDefaultTitle).toHaveBeenCalledWith("first");
    expect(machine.getSnapshot().deferredAgent).toBeUndefined();
  });

  it("un-arms when every held message is cancelled before the spawn is issued", async () => {
    // No gallery yet: the send is held but cannot be issued.
    const { machine, host } = machineWith({ input: "hello", availableAgents: [] });
    await machine.send();
    await settle();
    const state = machine.getSnapshot().deferredAgent!;
    expect(state.launching).toBe(true);
    state.cancelQueued(state.queued[0]!.id);
    expect(machine.getSnapshot().deferredAgent?.launching ?? false).toBe(false);
    machine.setHostInputs({ availableAgents: [AGENT] });
    machine.reconcile();
    await settle();
    expect(host.onAddAgent).not.toHaveBeenCalled();
    expect(machine.getSnapshot().deferredAgent?.setupActive).toBe(true);
  });

  it("enqueues a retained opening request once and retires it when resolved elsewhere", () => {
    const { machine, host } = machineWith({
      openingRequest: "do the thing",
      firstAgentModelPreflight: "selection-required",
    });
    expect(machine.getSnapshot().deferredAgent?.queued).toEqual([
      expect.objectContaining({ kind: "opening-request", text: "do the thing" }),
    ]);
    machine.reconcile();
    expect(machine.getSnapshot().deferredAgent?.queued).toHaveLength(1);
    machine.setHostInputs({ openingRequest: undefined });
    machine.reconcile();
    expect(machine.getSnapshot().deferredAgent?.queued ?? []).toHaveLength(0);
    expect(host.onAddAgent).not.toHaveBeenCalled();
  });

  it("delivers an opening request through resolveOpeningRequest when an agent joins", async () => {
    const { machine, host } = machineWith({ openingRequest: "do the thing", onAddAgent: undefined });
    machine.setHostInputs({ participants: AGENT_ROSTER });
    machine.reconcile();
    await settle();
    expect(host.resolveOpeningRequest).toHaveBeenCalledWith("deliver");
    expect(host.publishText).not.toHaveBeenCalled();
    expect(machine.getSnapshot().deferredAgent).toBeUndefined();
  });

  it("prepares the provisional intent once per fingerprint and retires it on dispose", async () => {
    const onPrepareAgent = vi.fn().mockResolvedValue(undefined);
    const { machine } = machineWith({
      onPrepareAgent,
      modelCatalog: CATALOG,
      defaultModelRef: MODEL,
      defaultAgentConfig: { model: MODEL },
    });
    const release = machine.retain();
    expect(onPrepareAgent).toHaveBeenCalledTimes(1);
    expect(onPrepareAgent).toHaveBeenCalledWith(undefined, expect.objectContaining({ model: MODEL }));
    // Equal inputs (even new objects) do not re-prepare.
    machine.setHostInputs({ defaultAgentConfig: { model: MODEL } });
    machine.reconcile();
    machine.reconcile();
    expect(onPrepareAgent).toHaveBeenCalledTimes(1);

    // StrictMode-style release + re-retain in the same turn keeps the lease.
    release();
    const again = machine.retain();
    await settle();
    expect(onPrepareAgent).toHaveBeenCalledTimes(1);

    again();
    await settle();
    expect(onPrepareAgent).toHaveBeenCalledTimes(2);
    expect(onPrepareAgent).toHaveBeenLastCalledWith(undefined, null);
  });

  it("keeps snapshot identity when nothing changed", () => {
    const { machine } = machineWith();
    const before = machine.getSnapshot();
    machine.setHostInputs({ participants: {} });
    machine.reconcile();
    expect(machine.getSnapshot()).toBe(before);
  });
});
