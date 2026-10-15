import { describe, expect, it, vi } from "vitest";
import type { Participant } from "@workspace/pubsub";
import { makeTestCatalogEntry } from "@workspace/model-catalog/testing";
import type { ModelCatalog } from "@workspace/model-catalog/catalog";
import type { AvailableAgent, ChatParticipantMetadata } from "../../types.js";
import { DeferredAgentMachine } from "./deferred-agent-machine.js";
import type { DeferredAgentInputs, PendingDelivery, DeferredQueueStore } from "./types.js";

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
  it("keeps a failed discard in cleanup-only state so retry cannot send it", async () => {
    const failure = new Error("discard retention cleanup failed");
    const remove = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const materialize = vi.fn(async (item: PendingDelivery) => item);
    const { machine, host } = machineWith({
      queueStore: {
        load: async () => [{ kind: "message", id: "discard", text: "never send" }],
        put: vi.fn(),
        remove,
        materialize,
      },
    });
    await machine.ready();
    await expect(machine.discardQueued("discard")).rejects.toBe(failure);
    expect(machine.getSnapshot().deferredAgent?.queued[0]).toMatchObject({
      retirement: "releasing",
      status: "failed",
    });
    machine.retryDelivery("discard");
    await vi.waitFor(() => expect(machine.getSnapshot().deferredAgent?.queued ?? []).toEqual([]));
    expect(remove).toHaveBeenCalledTimes(2);
    expect(materialize).not.toHaveBeenCalled();
    expect(host.publishText).not.toHaveBeenCalled();
    await machine.close();
  });

  it("cancels and joins the active attachment borrow without hydrating or publishing later items", async () => {
    const logged = vi.spyOn(console, "error");
    let release!: () => void;
    let borrowingSignal: AbortSignal | undefined;
    let joined = false;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store: DeferredQueueStore = {
      load: async () =>
        ["first", "later"].map((id) => ({
          kind: "message",
          id,
          text: id,
          attachmentSummaries: [{ name: "file", mimeType: "text/plain", size: 1 }],
        })),
      put: vi.fn(),
      remove: vi.fn(),
      materialize: vi.fn(async (item, signal) => {
        borrowingSignal = signal;
        try {
          await held;
          signal.throwIfAborted();
          return item;
        } finally {
          joined = true;
        }
      }),
    };
    const { machine, host } = machineWith({ queueStore: store, participants: AGENT_ROSTER });
    await machine.ready();
    await vi.waitFor(() => expect(store.materialize).toHaveBeenCalledTimes(1));
    let retired = false;
    const closing = machine.close().then(() => {
      retired = true;
    });
    expect(borrowingSignal?.aborted).toBe(true);
    await Promise.resolve();
    expect(retired).toBe(false);
    release();
    await closing;
    expect(joined).toBe(true);
    expect(host.publishText).not.toHaveBeenCalled();
    expect(store.materialize).toHaveBeenCalledTimes(1);
    expect(store.remove).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it("retains an independent hydration failure concurrent with owner cancellation", async () => {
    const logged = vi.spyOn(console, "error");
    const failure = new Error("retained storage disconnected");
    let reject!: (error: unknown) => void;
    const borrow = vi.fn(
      () =>
        new Promise<PendingDelivery>((_resolve, fail) => {
          reject = fail;
        })
    );
    const { machine } = machineWith({
      participants: AGENT_ROSTER,
      queueStore: {
        load: async () => [{ kind: "message", id: "held", text: "held" }],
        put: vi.fn(),
        remove: vi.fn(),
        materialize: borrow,
      },
    });
    await machine.ready();
    await vi.waitFor(() => expect(borrow).toHaveBeenCalledTimes(1));
    const closing = machine.close();
    const rejected = expect(closing).rejects.toMatchObject({ errors: [failure] });
    reject(failure);
    await rejected;
    expect(logged).toHaveBeenCalledWith("[DeferredAgentMachine] Queue retirement failed:", failure);
    logged.mockRestore();
  });

  it("keeps attempted payload immutable across ambiguous receipt loss and restart", async () => {
    let durable: PendingDelivery[] = [];
    const store: DeferredQueueStore = {
      load: async () => durable,
      put: async (item) => {
        durable = [item];
      },
      remove: async () => {
        durable = [];
      },
    };
    const failure = new Error("receipt transport lost");
    const { machine, host } = machineWith({
      participants: AGENT_ROSTER,
      queueStore: store,
      input: "possibly accepted",
      publishText: vi.fn().mockRejectedValue(failure),
    });
    await machine.ready();
    await machine.send();
    await vi.waitFor(() =>
      expect(machine.getSnapshot().deferredAgent?.queued[0]?.status).toBe("failed")
    );
    expect(durable[0]?.publication).toBe("attempted");
    await expect(machine.editQueued(durable[0]!.id, "different payload")).rejects.toThrow(
      "may have been accepted"
    );
    const originalKey = durable[0]!.idempotencyKey;
    await machine.close();
    const restored = machineWith({ queueStore: store }).machine;
    await restored.ready();
    await expect(restored.editQueued(durable[0]!.id, "different again")).rejects.toThrow(
      "may have been accepted"
    );
    expect(durable[0]?.idempotencyKey).toBe(originalKey);
    expect(host.publishText).toHaveBeenCalledTimes(1);
    await restored.close();
  });

  it("publishes durable user messages without spawning an agent when first-agent setup is not pending", async () => {
    const store: DeferredQueueStore = {
      load: async () => [],
      put: vi.fn(),
      remove: vi.fn(),
    };
    const { machine, host } = machineWith({
      firstAgentPending: false,
      input: "no agent requested",
      queueStore: store,
    });
    await machine.ready();
    await machine.send();
    await vi.waitFor(() => expect(store.remove).toHaveBeenCalledTimes(1));
    expect(host.publishText).toHaveBeenCalledWith(
      "no agent requested",
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
    expect(host.onAddAgent).not.toHaveBeenCalled();
    await machine.close();
  });

  it("uses the same durable admission and idempotent publication for an already present agent", async () => {
    let durable: PendingDelivery[] = [];
    let finish!: () => void;
    const store: DeferredQueueStore = {
      load: async () => durable,
      put: async (item) => {
        durable = [...durable.filter((entry) => entry.id !== item.id), item];
      },
      remove: vi.fn(async (id) => {
        durable = durable.filter((item) => item.id !== id);
      }),
    };
    const { machine, host } = machineWith({
      participants: AGENT_ROSTER,
      queueStore: store,
      input: "normal message",
      publishText: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      ),
    });
    await machine.ready();
    await machine.send(undefined, {
      mentions: ["ai"],
      replyTo: "reply",
      metadata: { deliverAfterTurn: true },
    });
    await vi.waitFor(() => expect(host.publishText).toHaveBeenCalledTimes(1));
    expect(host.coreSendMessage).not.toHaveBeenCalled();
    expect(durable).toHaveLength(1);
    const item = durable[0]!;
    expect(host.publishText).toHaveBeenCalledWith(
      "normal message",
      expect.objectContaining({
        idempotencyKey: item.idempotencyKey,
        mentions: ["ai"],
        replyTo: "reply",
        metadata: { deliverAfterTurn: true },
      })
    );
    finish();
    await vi.waitFor(() => expect(durable).toEqual([]));
    await machine.close();
  });

  it("commits queue admission before clearing the draft and restores the same delivery after restart", async () => {
    let durable: PendingDelivery[] = [];
    let commit!: () => void;
    const store: DeferredQueueStore = {
      load: async () => durable,
      put: vi.fn(
        (item) =>
          new Promise<void>((resolve) => {
            commit = () => {
              durable = [item];
              resolve();
            };
          })
      ),
      remove: async (id) => {
        durable = durable.filter((item) => item.id !== id);
      },
    };
    const { machine, host } = machineWith({
      input: "durable draft",
      queueStore: store,
    });
    await machine.ready();
    const sending = machine.send();
    await vi.waitFor(() => expect(store.put).toHaveBeenCalledTimes(1));
    expect(host.clearComposer).not.toHaveBeenCalled();
    expect(machine.getSnapshot().deferredAgent?.queued).toEqual([]);
    commit();
    await sending;
    expect(host.clearComposer).toHaveBeenCalledTimes(1);
    const admitted = machine.getSnapshot().deferredAgent!.queued[0]!;
    expect(admitted).toMatchObject(durable[0]!);
    await machine.close();
    const restored = machineWith({ queueStore: store }).machine;
    await restored.ready();
    expect(restored.getSnapshot().deferredAgent!.queued[0]).toEqual(admitted);
    await restored.close();
  });

  it("keeps the draft and queue unchanged when persistence rejects admission", async () => {
    const failure = new Error("durable queue write failed");
    const { machine, host } = machineWith({
      input: "keep me",
      queueStore: {
        load: async () => [],
        put: async () => {
          throw failure;
        },
        remove: vi.fn(),
      },
    });
    await machine.ready();
    await expect(machine.send()).rejects.toBe(failure);
    expect(host.clearComposer).not.toHaveBeenCalled();
    expect(machine.getSnapshot().deferredAgent?.queued).toEqual([]);
    await machine.close();
  });

  it("publishes a restored edited delivery once with its original idempotency key, then retires it", async () => {
    const item: PendingDelivery = {
      kind: "message",
      id: "saved",
      idempotencyKey: "original-key",
      text: "before edit",
    };
    let durable = [item];
    const store: DeferredQueueStore = {
      load: async () => durable,
      put: async (next) => {
        durable = [next];
      },
      remove: vi.fn(async () => {
        durable = [];
      }),
    };
    const { machine, host } = machineWith({ queueStore: store });
    await machine.ready();
    await machine.editQueued(item.id, "after edit");
    expect(durable[0]).toMatchObject({
      text: "after edit",
      idempotencyKey: "original-key",
    });
    machine.setHostInputs({ participants: AGENT_ROSTER, input: "" });
    machine.reconcile();
    await vi.waitFor(() => expect(store.remove).toHaveBeenCalledWith(item.id, "accepted"));
    expect(host.publishText).toHaveBeenCalledWith(
      "after edit",
      expect.objectContaining({ idempotencyKey: "original-key" })
    );
    expect(durable).toEqual([]);
    await machine.close();
  });

  it("arms on the first send and spawns exactly once", async () => {
    const { machine, host } = machineWith({ input: "hello" });
    expect(machine.getSnapshot().deferredAgent?.setupActive).toBe(true);
    await machine.send();
    await settle();
    expect(host.clearComposer).toHaveBeenCalledTimes(1);
    expect(host.coreSendMessage).not.toHaveBeenCalled();
    expect(host.onAddAgent).toHaveBeenCalledTimes(1);
    expect(host.onAddAgent).toHaveBeenCalledWith(
      undefined,
      expect.not.objectContaining({ handle: expect.anything() })
    );
    expect(machine.getSnapshot().deferredAgent).toMatchObject({
      launching: true,
      setupActive: false,
    });

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
    const { machine, host } = machineWith({
      input: "hello",
      availableAgents: [],
    });
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
      expect.objectContaining({
        kind: "opening-request",
        text: "do the thing",
      }),
    ]);
    machine.reconcile();
    expect(machine.getSnapshot().deferredAgent?.queued).toHaveLength(1);
    machine.setHostInputs({ openingRequest: undefined });
    machine.reconcile();
    expect(machine.getSnapshot().deferredAgent?.queued ?? []).toHaveLength(0);
    expect(host.onAddAgent).not.toHaveBeenCalled();
  });

  it("delivers an opening request through resolveOpeningRequest when an agent joins", async () => {
    const { machine, host } = machineWith({
      openingRequest: "do the thing",
      onAddAgent: undefined,
    });
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
    expect(onPrepareAgent).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ model: MODEL })
    );
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

  it("keeps each failure on its own item, marks later items waiting, and retries or discards per item", async () => {
    const publishText = vi
      .fn()
      .mockRejectedValueOnce(new Error("Publication rejected"))
      .mockResolvedValue(undefined);
    const { machine } = machineWith({ input: "first", publishText });
    await machine.send();
    machine.setHostInputs({ input: "second" });
    await machine.send();
    machine.setHostInputs({ participants: AGENT_ROSTER });
    machine.reconcile();
    await settle();
    const state = machine.getSnapshot().deferredAgent!;
    expect(state.queued.map((item) => [item.text, item.status])).toEqual([
      ["first", "failed"],
      ["second", "waiting"],
    ]);
    const [failed, waiting] = state.queued;
    expect(failed!.failure).toMatchObject({
      title: "Couldn't send this message",
      detail: "Publication rejected",
    });
    expect(waiting!.waitingOn).toBe(failed!.id);
    expect(state.deliveryError).toBe("Publication rejected");
    // The snapshot is stable until something changes.
    machine.reconcile();
    expect(machine.getSnapshot().deferredAgent).toBe(state);

    // Retry the failed item: same idempotency key, then the waiting one follows.
    state.retryDelivery(failed!.id);
    await settle();
    expect(publishText).toHaveBeenCalledTimes(3);
    expect(publishText.mock.calls[1]![1]).toMatchObject({
      idempotencyKey: failed!.idempotencyKey,
    });
    expect(machine.getSnapshot().deferredAgent).toBeUndefined();
  });

  it("discards a failed item and resumes the rest", async () => {
    const publishText = vi
      .fn()
      .mockRejectedValueOnce(new Error("Publication rejected"))
      .mockResolvedValue(undefined);
    const { machine } = machineWith({ input: "first", publishText });
    await machine.send();
    machine.setHostInputs({ input: "second" });
    await machine.send();
    machine.setHostInputs({ participants: AGENT_ROSTER });
    machine.reconcile();
    await settle();
    const state = machine.getSnapshot().deferredAgent!;
    state.discardQueued(state.queued[0]!.id);
    await settle();
    expect(publishText).toHaveBeenLastCalledWith("second", expect.anything());
    expect(machine.getSnapshot().deferredAgent).toBeUndefined();
  });

  it("reports launch stages from lifecycle facts and a failed launch's reason", async () => {
    let finishAdd!: () => void;
    let failAdd!: (error: Error) => void;
    const onAddAgent = vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          finishAdd = resolve;
          failAdd = reject;
        })
    );
    const { machine } = machineWith({
      input: "hello",
      onAddAgent,
      firstAgentModelPreflight: "checking",
    });
    await machine.send();
    expect(machine.getSnapshot().deferredAgent?.launchStage).toBe("preparing-model");
    machine.setHostInputs({ firstAgentModelPreflight: "ready" });
    machine.reconcile();
    await settle();
    expect(machine.getSnapshot().deferredAgent?.launchStage).toBe("creating-agent");
    finishAdd();
    await settle();
    expect(machine.getSnapshot().deferredAgent?.launchStage).toBe("joining");
    machine.setHostInputs({
      pendingAgents: new Map([
        [
          "ai-chat",
          {
            agentId: "x",
            status: "error",
            error: { message: "Build failed", details: "tsc: 2 errors" },
          },
        ],
      ]),
    });
    machine.reconcile();
    const failed = machine.getSnapshot().deferredAgent!;
    expect(failed.launchStage).toBe("failed");
    expect(failed.launchError).toMatchObject({
      title: "Your agent couldn't start",
      detail: "Build failed\ntsc: 2 errors",
    });
    // A rejected create carries its own reason.
    machine.setHostInputs({ pendingAgents: new Map() });
    failed.retryLaunch();
    await settle();
    failAdd(new Error("quota exceeded"));
    await settle();
    expect(machine.getSnapshot().deferredAgent?.launchError).toMatchObject({
      title: "Your agent couldn't be created",
      detail: "quota exceeded",
    });
    machine.setHostInputs({ participants: AGENT_ROSTER });
    machine.reconcile();
    expect(machine.getSnapshot().deferredAgent?.launchStage).toBe("ready");
  });

  it("explains a blocked start instead of silently doing nothing", async () => {
    const needsSetup: ModelCatalog = {
      providers: [],
      models: [
        makeTestCatalogEntry({
          ref: MODEL,
          id: "gpt-6.1-sol",
          name: "GPT-6.1 Sol",
          provider: "openai-codex",
          baseUrl: "https://chatgpt.com/backend-api",
          availability: { state: "needs-setup", detail: "no-credential" },
        }),
      ],
    };
    const { machine, host } = machineWith({
      input: "hello",
      modelCatalog: needsSetup,
      firstAgentModelPreflight: "selection-required",
      defaultModelRef: MODEL,
    });
    await machine.send();
    machine.getSnapshot().deferredAgent!.startQueued();
    const state = machine.getSnapshot().deferredAgent!;
    expect(state.setupRequired).toMatchObject({
      reason: "model-needs-setup",
      modelRef: MODEL,
      title: "GPT-6.1 Sol isn't ready yet",
    });
    expect(host.onAddAgent).not.toHaveBeenCalled();
    state.setDraft({ ...state.draft, model: "" });
    expect(machine.getSnapshot().deferredAgent?.setupRequired).toBeUndefined();
    machine.getSnapshot().deferredAgent!.startQueued();
    expect(machine.getSnapshot().deferredAgent?.setupRequired).toMatchObject({
      reason: "no-model-selected",
    });
  });
});
