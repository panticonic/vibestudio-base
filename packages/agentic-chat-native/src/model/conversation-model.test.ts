import { beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => {
  class FakeController {
    static instances: FakeController[] = [];
    snapshot: { channelName: string | null; connectionRetrySignal: number };
    listeners = new Set<() => void>();
    retained = 0;
    disposed = 0;
    actions = {};
    constructor(public ports: { state: { get(): { channelName?: string } } }) {
      this.snapshot = { channelName: ports.state.get().channelName ?? null, connectionRetrySignal: 0 };
      FakeController.instances.push(this);
    }
    getSnapshot = () => this.snapshot;
    subscribe = (listener: () => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };
    retain() {
      this.retained += 1;
      return () => {
        this.retained -= 1;
        this.disposed += 1;
      };
    }
    set(patch: Partial<typeof this.snapshot>) {
      this.snapshot = { ...this.snapshot, ...patch };
      for (const listener of [...this.listeners]) listener();
    }
  }
  class FakeSession {
    static instances: FakeSession[] = [];
    started = false;
    disposed = false;
    reconnects: string[] = [];
    hostSets = 0;
    constructor(public options: { channelName: string; forkNav: Record<string, (...args: never[]) => unknown> }) {
      FakeSession.instances.push(this);
    }
    retain() {
      return () => {};
    }
    start() {
      this.started = true;
    }
    dispose() {
      this.disposed = true;
    }
    setAgentHost() {
      this.hostSets += 1;
    }
    reconnect(reason: string) {
      this.reconnects.push(reason);
    }
  }
  return { FakeController, FakeSession, list: vi.fn(async () => []) };
});

vi.mock("@workspace/agentic-core/chat-store", async (importActual) => ({
  ...(await importActual<typeof import("@workspace/agentic-core/chat-store")>()),
  ChatHostController: fakes.FakeController,
  ChatSession: fakes.FakeSession,
  chatHostActionData: () => ({}),
  listChannelConversations: fakes.list,
}));

import { ChatConversationModel, type ChatConversationTarget } from "./conversation-model.js";

const rpc = { call: vi.fn() };
function makeModel(channelName?: string | null) {
  const targets: ChatConversationTarget[] = [];
  const model = new ChatConversationModel({
    hostPorts: (target) => {
      targets.push(target);
      return {
        rpc,
        contextId: target.contextId,
        instanceId: target.key,
        state: {
          get: () => (target.channelName ? { channelName: target.channelName } : {}),
          patch: async () => {},
          subscribe: () => () => {},
        },
      } as never;
    },
    connection: { clientId: "c", rpc: {} } as never,
    contextId: "ctx-main",
    ...(channelName !== undefined ? { channelName } : {}),
  });
  return { model, targets };
}

beforeEach(() => {
  fakes.FakeController.instances.length = 0;
  fakes.FakeSession.instances.length = 0;
  fakes.list.mockClear();
});

describe("ChatConversationModel", () => {
  it("builds ports and a controller lazily but holds no live work until retained", () => {
    const { model } = makeModel("chan-1");
    expect(model.getSnapshot().session).toBeNull();
    expect(fakes.FakeController.instances[0]?.retained).toBe(0);
  });

  it("joins the channel once the host has one, and tears down on release", () => {
    const { model } = makeModel(null);
    const release = model.retain();
    const controller = fakes.FakeController.instances[0]!;
    expect(controller.retained).toBe(1);
    expect(model.getSnapshot().session).toBeNull();
    controller.set({ channelName: "chat-abc" });
    const session = model.getSnapshot().session as unknown as InstanceType<typeof fakes.FakeSession>;
    expect(session.options.channelName).toBe("chat-abc");
    expect(session.started).toBe(true);
    release();
    expect(session.disposed).toBe(true);
    expect(controller.retained).toBe(0);
    expect(model.getSnapshot().session).toBeNull();
  });

  it("reconnects the session when the host reports the connection unblocked", () => {
    const { model } = makeModel("chan-1");
    model.retain();
    const controller = fakes.FakeController.instances[0]!;
    const session = model.getSnapshot().session as unknown as InstanceType<typeof fakes.FakeSession>;
    controller.set({ connectionRetrySignal: 1 });
    expect(session.reconnects).toEqual(["host-unblocked"]);
    controller.set({ connectionRetrySignal: 1 });
    expect(session.reconnects).toEqual(["host-unblocked"]);
  });

  it("switches conversation with a fresh host and session, bumping the generation", () => {
    const { model, targets } = makeModel("chan-1");
    model.retain();
    const firstController = fakes.FakeController.instances[0]!;
    const firstSession = model.getSnapshot().session as unknown as InstanceType<typeof fakes.FakeSession>;
    const generation = model.getSnapshot().generation;
    model.openConversation("chan-2", "ctx-2");
    expect(firstSession.disposed).toBe(true);
    expect(firstController.retained).toBe(0);
    const next = model.getSnapshot();
    expect(next.generation).toBe(generation + 1);
    expect(targets.at(-1)).toMatchObject({ channelName: "chan-2", contextId: "ctx-2" });
    expect(targets.at(-1)?.key).not.toBe(targets[0]?.key);
    expect((next.session as unknown as InstanceType<typeof fakes.FakeSession>).options.channelName).toBe("chan-2");
    expect(fakes.FakeController.instances.at(-1)?.retained).toBe(1);
  });

  it("opens the same conversation as a no-op", () => {
    const { model } = makeModel("chan-1");
    model.retain();
    const before = model.getSnapshot();
    model.openConversation("chan-1", "ctx-main");
    expect(model.getSnapshot()).toBe(before);
  });

  it("starts a new chat in the model's own context", () => {
    const { model, targets } = makeModel("chan-1");
    model.retain();
    model.newConversation();
    expect(targets.at(-1)).toMatchObject({ channelName: null, contextId: "ctx-main" });
    expect(model.getSnapshot().session).toBeNull();
  });

  it("takes a fresh host when re-retained after a full release", () => {
    const { model } = makeModel("chan-1");
    model.retain()();
    expect(model.getSnapshot().session).toBeNull();
    model.retain();
    expect(fakes.FakeController.instances).toHaveLength(2);
    expect(fakes.FakeController.instances[1]?.retained).toBe(1);
    expect(model.getSnapshot().session).not.toBeNull();
  });

  it("lists the context's conversations with the current one marked", async () => {
    const { model } = makeModel("chan-1");
    await model.listConversations();
    expect(fakes.list).toHaveBeenCalledWith(rpc, { currentChannelId: "chan-1" });
  });

  it("routes a fork switch through the model", () => {
    const { model } = makeModel("chan-1");
    model.retain();
    const session = model.getSnapshot().session as unknown as InstanceType<typeof fakes.FakeSession>;
    void session.options.forkNav["switchTo"]!("fork-1" as never, "ctx-f" as never);
    expect(model.getSnapshot().target).toMatchObject({ channelName: "fork-1", contextId: "ctx-f" });
  });
});
