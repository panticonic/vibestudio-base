import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTestCatalogEntry } from "@workspace/model-catalog/testing";
import {
  MODEL_SETTINGS_SERVICE_PROTOCOL,
  type ModelSettingsSnapshot,
} from "@workspace/model-catalog/catalog";
import { ChatHostController } from "./chat-host-controller.js";
import type {
  ChatHostPorts,
  ChatHostState,
  ChatHostStatePatch,
  ChatHostWorkspaceEvent,
} from "./ports.js";

const MODEL = "openai-codex:gpt-6-luna";
const SETTINGS_TARGET = "do:workers/model-settings:ModelSettingsDO:workspace";

function settings(): ModelSettingsSnapshot {
  return {
    catalog: {
      providers: [],
      models: [
        makeTestCatalogEntry({
          ref: MODEL,
          id: "gpt-6-luna",
          name: "GPT-6 Luna",
          provider: "openai-codex",
          baseUrl: "https://chatgpt.com/backend-api",
        }),
      ],
    },
    defaultModel: MODEL,
    defaultModelSource: "workspace",
    defaultAgentConfig: { model: MODEL, approvalLevel: 2 },
  };
}

function reviewPending(): Error {
  return Object.assign(new Error("Waiting for workspace review"), {
    code: "EREVIEWPENDING",
    errorData: {
      authorityFailure: {
        remediation: { review: { approvalId: "review-1", title: "Review" } },
      },
    },
  });
}

class FakeState {
  value: ChatHostState;
  listeners = new Set<() => void>();
  patch = vi.fn(async (partial: ChatHostStatePatch) => {
    const next: Record<string, unknown> = { ...this.value };
    for (const [key, entry] of Object.entries(partial)) {
      if (entry === null) delete next[key];
      else next[key] = entry;
    }
    this.value = next as ChatHostState;
    for (const listener of this.listeners) listener();
  });
  constructor(initial: ChatHostState = {}) {
    this.value = initial;
  }
  port() {
    return {
      get: () => this.value,
      patch: (partial: ChatHostStatePatch) => this.patch(partial),
      subscribe: (listener: () => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
    };
  }
}

type Wire = (target: string, method: string, args: unknown[]) => Promise<unknown>;

function harness(options: {
  state?: ChatHostState;
  participants?: string[];
  wire?: Wire;
  getSettings?: () => Promise<ModelSettingsSnapshot>;
  listSources?: () => Promise<unknown>;
} = {}) {
  const state = new FakeState(options.state);
  const participants = options.participants ?? [];
  let uuid = 0;
  const call = vi.fn(async (target: string, method: string, args: unknown[]) => {
    const overridden = await options.wire?.(target, method, args);
    if (overridden !== undefined) return overridden;
    if (method === "workers.resolveService") {
      const query = String(args[0]);
      if (query === MODEL_SETTINGS_SERVICE_PROTOCOL)
        return durableObjectServiceFixture(SETTINGS_TARGET, {
          origin: "workspace",
          source: "workers/model-settings",
          name: "model-settings",
          action: "provide",
          presentation: { domain: "web", verb: "see" },
          authority: { principals: ["code"] },
          protocols: [MODEL_SETTINGS_SERVICE_PROTOCOL],
          className: "ModelSettingsDO",
          objectKey: "workspace",
        });
      const channelId = String(args[1]);
      return durableObjectServiceFixture(`do:workers/pubsub-channel:PubSubChannel:${channelId}`, {
        origin: "workspace",
        source: "workers/pubsub-channel",
        name: "channel",
        action: "provide",
        presentation: { domain: "web", verb: "see" },
        authority: { principals: ["code"] },
        protocols: ["vibestudio.channel.v1"],
        className: "PubSubChannel",
        objectKey: channelId,
      });
    }
    if (method === "getSettings") return (options.getSettings ?? (async () => settings()))();
    if (method === "workers.listSources" && options.listSources) return options.listSources();
    if (method === "workers.listSources")
      return [
        {
          source: "workers/agent-worker",
          name: "agent-worker",
          title: "AI Chat",
          agent: { displayName: "AI Chat" },
          classes: [{ className: "AiChatWorker" }],
        },
      ];
    if (method === "build.getBuildReport") return { status: "ok" };
    if (method === "getParticipants")
      return participants.map((participantId) => ({ participantId }));
    if (method === "runtime.createEntity") {
      const spec = args[0] as { key: string; contextId?: string };
      const id = `do:workers/agent-worker:AiChatWorker:${spec.key}`;
      return {
        id,
        kind: "do",
        source: { repoPath: "workers/agent-worker", effectiveVersion: "test" },
        targetId: id,
        contextId: spec.contextId,
        agentInitialization: { ok: true, participantId: id },
      };
    }
    if (method === "subscribeChannel") return { ok: true, participantId: target };
    if (method === "unsubscribeChannel") return { ok: true };
    if (method === "runtime.retireEntity") return undefined;
    throw new Error(`unexpected rpc ${target}.${method}`);
  });
  const notify = vi.fn();
  const handlers = new Map<ChatHostWorkspaceEvent, Set<() => void>>();
  const emit = (event: ChatHostWorkspaceEvent) => {
    for (const handler of handlers.get(event) ?? []) handler();
  };
  const ports: ChatHostPorts = {
    onWorkspaceEvent: (event, handler) => {
      const set = handlers.get(event) ?? new Set();
      handlers.set(event, set);
      set.add(handler);
      return () => set.delete(handler);
    },
    rpc: schemaRpcMock({ call: (target, method, args) => call(target, method, args) }),
    contextId: "ctx-1",
    state: state.port(),
    notify,
    instanceId: "slot-1",
    randomUuid: () => `${String(++uuid).padStart(4, "0")}uuid-0000`,
  };
  const controller = new ChatHostController(ports);
  const methods = () => call.mock.calls.map((entry) => entry[1]);
  return { controller, state, call, methods, notify, emit };
}

const live: ChatHostController[] = [];
function start(h: ReturnType<typeof harness>) {
  live.push(h.controller);
  h.controller.retain();
  return h;
}
afterEach(() => {
  for (const controller of live.splice(0)) controller.dispose();
  vi.useRealTimers();
});

describe("ChatHostController bootstrap", () => {
  it("mints one channel and persists it through the state port", async () => {
    const h = start(harness());
    expect(h.controller.getSnapshot().channelName).toBe("chat-0001uuid");
    await vi.waitFor(() => expect(h.state.value.channelName).toBe("chat-0001uuid"));
    expect(h.state.patch).toHaveBeenCalledTimes(1);
    expect(h.controller.getSnapshot().channelName).toBe("chat-0001uuid");
  });

  it("re-persists the same identity after a workspace review blocks it", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.state.patch.mockRejectedValueOnce(reviewPending());
    start(h);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.state.value.channelName).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(h.state.patch).toHaveBeenCalledTimes(2);
    expect(h.state.patch).toHaveBeenLastCalledWith({ channelName: "chat-0001uuid" });
    expect(h.state.value.channelName).toBe("chat-0001uuid");
  });

  it("keeps a persisted channel", () => {
    const h = start(harness({ state: { channelName: "chat-existing" } }));
    expect(h.controller.getSnapshot().channelName).toBe("chat-existing");
    expect(h.state.patch).not.toHaveBeenCalled();
  });
});

describe("ChatHostController model settings", () => {
  it("shares one discovery flight and derives the first-agent preflight", async () => {
    let resolve!: (value: ModelSettingsSnapshot) => void;
    const getSettings = vi.fn(
      () => new Promise<ModelSettingsSnapshot>((done) => (resolve = done))
    );
    const h = start(harness({ state: { channelName: "c" }, getSettings }));
    expect(h.controller.getSnapshot().firstAgentModelPreflight).toBe("checking");
    const joined = h.controller.loadModelSettings(true);
    h.controller.retryModelSettings();
    await vi.waitFor(() => expect(getSettings).toHaveBeenCalledTimes(1));
    resolve(settings());
    await joined;
    expect(getSettings).toHaveBeenCalledTimes(1);
    expect(h.controller.getSnapshot()).toMatchObject({
      firstAgentModelPreflight: "ready",
      workspaceDefaultModelRef: MODEL,
      effectiveDefaultAgentConfig: { model: MODEL, approvalLevel: 2 },
    });
  });

  it("reports a discovery failure and signals the connection once a retry succeeds", async () => {
    const getSettings = vi
      .fn<() => Promise<ModelSettingsSnapshot>>()
      .mockRejectedValueOnce(new Error("models offline"))
      .mockResolvedValue(settings());
    const h = start(harness({ state: { channelName: "c" }, getSettings }));
    await vi.waitFor(() =>
      expect(h.controller.getSnapshot().modelSettingsError).toMatchObject({
        title: "Models are unavailable right now",
        detail: "models offline",
      })
    );
    expect(h.notify).not.toHaveBeenCalled();
    h.controller.retryModelSettings();
    await vi.waitFor(() => expect(h.controller.getSnapshot().connectionRetrySignal).toBe(1));
    expect(h.controller.getSnapshot().modelSettingsError).toBeNull();
  });
});

describe("ChatHostController recovery", () => {
  const installed = {
    agentId: "AiChatWorker",
    handle: "ai-chat-1",
    key: "ai-chat-1-key",
    source: "workers/agent-worker",
    className: "AiChatWorker",
  };

  it("re-subscribes a missing installed agent", async () => {
    const h = start(harness({ state: { channelName: "c", installedAgents: [installed] } }));
    // Recovery crosses several async RPC hops; bound the observation generously
    // so a loaded test host does not read a slow pass as a failure.
    await vi.waitFor(() => expect(h.methods()).toContain("runtime.createEntity"), { timeout: 10_000 });
    await vi.waitFor(() => expect(h.controller.getSnapshot().recovery.status).toBe("idle"), {
      timeout: 10_000,
    });
    const spec = h.call.mock.calls.find((entry) => entry[1] === "runtime.createEntity")![2][0] as {
      key: string;
      contextId: string;
    };
    expect(spec).toMatchObject({ key: "ai-chat-1-key", contextId: "ctx-1" });
  });

  it("restarts only when its recovery inputs change, not on unrelated state", async () => {
    const h = start(
      harness({
        state: { channelName: "c", installedAgents: [installed], forkCursors: { c: 1 } },
        participants: ["do:workers/agent-worker:AiChatWorker:ai-chat-1-key"],
      })
    );
    const participantReads = () => h.methods().filter((method) => method === "getParticipants");
    await vi.waitFor(() => expect(participantReads()).toHaveLength(1));
    for (const head of [2, 3, 4]) await h.controller.markForkRead("c", head);
    await Promise.resolve();
    expect(participantReads()).toHaveLength(1);
    await h.state.patch({
      installedAgents: [{ ...installed, key: "ai-chat-2-key", handle: "ai-chat-2" }],
    });
    await vi.waitFor(() => expect(participantReads()).toHaveLength(2));
  });

  it("reads a conversation's installed agents from its own roster", async () => {
    const h = start(
      harness({
        state: { channelName: "c" },
        wire: async (_target, method) =>
          method === "getParticipants"
            ? [
                { participantId: "user:u", metadata: { type: "user" } },
                {
                  participantId: "do:workers/agent-worker:AiChatWorker:ai-chat-1-key~fork~abc",
                  metadata: { type: "agent", handle: "ai-chat" },
                },
              ]
            : undefined,
      })
    );
    await expect(h.controller.rosterAgents("c-fork")).resolves.toEqual([
      {
        agentId: "AiChatWorker",
        handle: "ai-chat",
        key: "ai-chat-1-key~fork~abc",
        source: "workers/agent-worker",
        className: "AiChatWorker",
      },
    ]);
  });

  it("adopts a conversation's own roster as its persisted state", async () => {
    const h = start(
      harness({
        state: { channelName: "c" },
        wire: async (_target, method) =>
          method === "getParticipants"
            ? [
                { participantId: "user:u", metadata: { type: "user" } },
                {
                  participantId: "do:workers/agent-worker:AiChatWorker:ai-chat-1-key~fork~abc",
                  metadata: { type: "agent", handle: "ai-chat" },
                },
              ]
            : undefined,
      })
    );
    await expect(h.controller.conversationState("c-fork")).resolves.toMatchObject({
      channelName: "c-fork",
      installedAgents: [{ key: "ai-chat-1-key~fork~abc" }],
    });
  });

  it("leaves a present agent alone", async () => {
    const h = start(
      harness({
        state: { channelName: "c", installedAgents: [installed] },
        participants: ["do:workers/agent-worker:AiChatWorker:ai-chat-1-key"],
      })
    );
    await vi.waitFor(() => expect(h.methods()).toContain("getParticipants"));
    await vi.waitFor(() => expect(h.controller.getSnapshot().recovery.status).toBe("idle"));
    expect(h.methods()).not.toContain("runtime.createEntity");
  });

  it("fails visibly after one attempt (no timer), without a duplicate toast, and retries on events", async () => {
    vi.useFakeTimers();
    let failing = true;
    const h = start(
      harness({
        state: { channelName: "c", installedAgents: [installed] },
        wire: async (_target, method) => {
          if (method === "getParticipants" && failing) throw new Error("channel offline");
          return undefined;
        },
      })
    );
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(h.controller.getSnapshot().recovery.status).toBe("failed"));
    expect(h.controller.getSnapshot().recovery).toMatchObject({
      attempt: 1,
      error: { title: "Your agent didn't reconnect to this conversation", detail: "channel offline" },
    });
    const reads = () => h.methods().filter((method) => method === "getParticipants").length;
    expect(reads()).toBe(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(reads()).toBe(1);
    expect(h.notify).not.toHaveBeenCalled();
    failing = false;
    // A publication changed the workspace's units: recovery tries again.
    h.emit("units-changed");
    await vi.waitFor(() => expect(h.controller.getSnapshot().recovery.status).toBe("idle"));
    expect(h.controller.getSnapshot().recovery.attempt).toBe(2);
    expect(reads()).toBe(2);
    h.controller.retryAgentRecovery();
    await vi.waitFor(() => expect(reads()).toBe(3));
  });

  it("re-checks when a participant leaves the channel", async () => {
    const h = start(
      harness({
        state: { channelName: "c", installedAgents: [installed] },
        participants: ["do:workers/agent-worker:AiChatWorker:ai-chat-1-key"],
      })
    );
    const reads = () => h.methods().filter((method) => method === "getParticipants").length;
    await vi.waitFor(() => expect(h.controller.getSnapshot().recovery.status).toBe("idle"));
    expect(reads()).toBe(1);
    h.controller.notifyParticipantsChanged(["user:1", "agent:a"]);
    h.controller.notifyParticipantsChanged(["user:1", "agent:a", "agent:b"]);
    expect(reads()).toBe(1);
    h.controller.notifyParticipantsChanged(["user:1"]);
    await vi.waitFor(() => expect(reads()).toBe(2));
  });
});

describe("ChatHostController agent catalog", () => {
  it("reads once, waits for the units-changed event instead of polling, and surfaces failures", async () => {
    vi.useFakeTimers();
    let sources: unknown = [];
    const listSources = vi.fn(async () => {
      if (sources instanceof Error) throw sources;
      return sources;
    });
    const h = start(harness({ state: { channelName: "c" }, listSources }));
    await vi.advanceTimersByTimeAsync(0);
    expect(listSources).toHaveBeenCalledTimes(1);
    expect(h.controller.getSnapshot().availableAgents).toEqual([]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(listSources).toHaveBeenCalledTimes(1);
    sources = [
      {
        source: "workers/agent-worker",
        name: "agent-worker",
        title: "AI Chat",
        agent: { displayName: "AI Chat" },
        classes: [{ className: "AiChatWorker" }],
      },
    ];
    h.emit("units-changed");
    await vi.waitFor(() => expect(h.controller.getSnapshot().availableAgents).toHaveLength(1));
    sources = new Error("hub restarting");
    h.emit("units-changed");
    await vi.waitFor(() =>
      expect(h.controller.getSnapshot().agentCatalogError).toMatchObject({
        title: "Couldn't load the list of agents",
        detail: "hub restarting",
      })
    );
    expect(h.controller.getSnapshot().availableAgents).toHaveLength(1);
    sources = [];
    h.controller.retryAgentCatalog();
    await vi.waitFor(() => expect(h.controller.getSnapshot().agentCatalogError).toBeNull());
  });
});

describe("ChatHostController agents", () => {
  it("claims the warm provisional entity for the first agent and persists it", async () => {
    const h = start(harness({ state: { channelName: "c" } }));
    await vi.waitFor(() => expect(h.controller.getSnapshot().availableAgents).toHaveLength(1));
    await h.controller.prepareAgent("c", "ctx-1", undefined, { model: MODEL });
    expect(h.methods().filter((method) => method === "runtime.createEntity")).toHaveLength(1);
    const result = await h.controller.addAgent("c", "ctx-1", undefined, { model: MODEL });
    // The warm entity is subscribed, not created a second time.
    expect(h.methods().filter((method) => method === "runtime.createEntity")).toHaveLength(1);
    expect(h.methods()).toContain("subscribeChannel");
    expect(result.agentId).toBe("workers/agent-worker");
    expect(h.state.value.installedAgents).toEqual([
      expect.objectContaining({ handle: result.handle, source: "workers/agent-worker" }),
    ]);
  });

  it("creates a fresh agent once one is already installed", async () => {
    const first = {
      agentId: "AiChatWorker",
      handle: "ai-chat-a",
      key: "ai-chat-a-key",
      source: "workers/agent-worker",
      className: "AiChatWorker",
    };
    const h = start(
      harness({
        state: { channelName: "c", installedAgents: [first] },
        participants: ["do:workers/agent-worker:AiChatWorker:ai-chat-a-key"],
      })
    );
    const result = await h.controller.addAgent("c", "ctx-1", undefined, { model: MODEL });
    expect(result.handle).toMatch(/^ai-chat-\w{4}$/);
    expect(h.methods()).not.toContain("subscribeChannel");
    expect(h.state.value.installedAgents).toHaveLength(2);
  });

  it("replaces an agent and rewrites its persisted record", async () => {
    const record = {
      agentId: "AiChatWorker",
      handle: "ai-chat",
      key: "old-key",
      source: "workers/agent-worker",
      className: "AiChatWorker",
    };
    const h = start(
      harness({
        state: { channelName: "c", installedAgents: [record] },
        participants: ["do:workers/agent-worker:AiChatWorker:old-key"],
      })
    );
    await h.controller.replaceAgent(
      "c",
      "do:workers/agent-worker:AiChatWorker:old-key",
      undefined,
      { model: MODEL, handle: "ai-chat" }
    );
    expect(h.methods()).toContain("unsubscribeChannel");
    expect(h.state.value.installedAgents).toEqual([
      expect.objectContaining({ handle: "ai-chat", config: expect.objectContaining({ model: MODEL }) }),
    ]);
    expect(h.state.value.installedAgents![0]!.key).not.toBe("old-key");
  });

  it("removes an installed agent by handle", async () => {
    const record = {
      agentId: "AiChatWorker",
      handle: "helper",
      key: "helper-key",
      source: "workers/agent-worker",
      className: "AiChatWorker",
    };
    const h = start(
      harness({
        state: { channelName: "c", installedAgents: [record] },
        participants: ["do:workers/agent-worker:AiChatWorker:helper-key"],
      })
    );
    await h.controller.removeAgent("c", "helper");
    expect(h.methods()).toContain("unsubscribeChannel");
    expect(h.state.value.installedAgents).toEqual([]);
    await expect(h.controller.removeAgent("c", "helper")).rejects.toThrow(/@helper/);
    expect(h.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Couldn't remove @helper" })
    );
  });

  it("persists an agent's model choice", async () => {
    const record = {
      agentId: "AiChatWorker",
      handle: "ai-chat",
      key: "k1",
      source: "workers/agent-worker",
      className: "AiChatWorker",
      config: { approvalLevel: 1 },
    };
    const h = start(
      harness({
        state: { channelName: "c", installedAgents: [record] },
        participants: ["do:workers/agent-worker:AiChatWorker:k1"],
      })
    );
    await h.controller.persistAgentModel("c", "do:workers/agent-worker:AiChatWorker:k1", MODEL);
    expect(h.state.value.installedAgents![0]!.config).toEqual({ approvalLevel: 1, model: MODEL });
    await expect(
      h.controller.persistAgentModel("c", "do:workers/agent-worker:AiChatWorker:missing", MODEL)
    ).rejects.toThrow(/No persisted agent record/);
  });

  it("serializes monotone fork read cursors", async () => {
    const h = start(harness({ state: { channelName: "c" } }));
    await Promise.all([
      h.controller.markForkRead("fork-1", 5),
      h.controller.markForkRead("fork-1", 3),
      h.controller.markForkRead("fork-2", 1),
    ]);
    expect(h.controller.readForkCursors()).toEqual({ "fork-1": 5, "fork-2": 1 });
  });
});
