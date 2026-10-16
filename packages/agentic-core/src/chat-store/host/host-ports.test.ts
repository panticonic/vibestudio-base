import { beforeEach, describe, expect, it, vi } from "vitest";

const waitForApprovalResolution = vi.hoisted(() => vi.fn());
vi.mock("@workspace/pubsub", () => ({ waitForApprovalResolution }));

import {
  CHAT_HOST_WORKSPACE_EVENT_NAMES,
  applyChatHostStatePatch,
  createChatHostPorts,
  createReviewWaiter,
  createStateArgsPort,
  createWorkspaceEventPort,
  type ChatHostEventsClient,
} from "./host-ports.js";

function fakeEvents() {
  const handlers = new Map<string, () => void>();
  const client = {
    on: vi.fn((name: string, handler: () => void) => {
      handlers.set(name, handler);
      return () => handlers.delete(name);
    }),
    subscribe: vi.fn(async () => undefined),
    unsubscribe: vi.fn(async () => undefined),
  };
  return { client: client as unknown as ChatHostEventsClient, handlers, spies: client };
}

beforeEach(() => {
  waitForApprovalResolution.mockReset();
});

describe("workspace event port", () => {
  it("maps each chat host event to its host event name", () => {
    expect(CHAT_HOST_WORKSPACE_EVENT_NAMES).toEqual({
      "approvals-changed": "shell-approval:pending-changed",
      "units-changed": "workspace:units-changed",
      "workspace-config-changed": "workspace:config-changed",
    });
  });

  it("subscribes for the handler's lifetime and delivers events", () => {
    const { client, handlers, spies } = fakeEvents();
    const port = createWorkspaceEventPort(client);
    const handler = vi.fn();
    const off = port("units-changed", handler);
    expect(spies.subscribe).toHaveBeenCalledWith("workspace:units-changed");
    handlers.get("workspace:units-changed")?.();
    expect(handler).toHaveBeenCalledTimes(1);
    off();
    expect(spies.unsubscribe).toHaveBeenCalledWith("workspace:units-changed");
    expect(handlers.size).toBe(0);
  });
});

describe("review waiter", () => {
  it("waits over the given rpc and resolves with no value", async () => {
    waitForApprovalResolution.mockResolvedValue("ignored");
    const rpc = {} as never;
    await expect(createReviewWaiter(rpc)("review-1")).resolves.toBeUndefined();
    expect(waitForApprovalResolution).toHaveBeenCalledWith(rpc, "review-1");
  });

  it("propagates a wait failure", async () => {
    waitForApprovalResolution.mockImplementation(async () => {
      throw new Error("gone");
    });
    await expect(createReviewWaiter({} as never)("r")).rejects.toThrow("gone");
  });
});

describe("state", () => {
  it("clears null keys and keeps the rest", () => {
    expect(
      applyChatHostStatePatch(
        { channelName: "a", agentSource: "s", forkCursors: { x: 1 } },
        { channelName: null, agentClass: "C" }
      )
    ).toEqual({ agentSource: "s", forkCursors: { x: 1 }, agentClass: "C" });
  });

  it("adapts a store: reads latest, patches without leaking its result, subscribes", async () => {
    let current = { channelName: "a" };
    const listeners = new Set<() => void>();
    const patch = vi.fn(async (partial: object) => {
      current = { ...current, ...partial };
      return "store-result";
    });
    const port = createStateArgsPort({
      get: () => current,
      patch,
      subscribe: (l) => (listeners.add(l), () => listeners.delete(l)),
    });
    await expect(port.patch({ agentClass: "C" })).resolves.toBeUndefined();
    expect(port.get()).toEqual({ channelName: "a", agentClass: "C" });
    const listener = vi.fn();
    const off = port.subscribe(listener);
    listeners.forEach((l) => l());
    expect(listener).toHaveBeenCalled();
    off();
    expect(listeners.size).toBe(0);
  });
});

describe("createChatHostPorts", () => {
  const rpc = { call: vi.fn(), status: vi.fn(), onStatusChange: vi.fn(), onRecovery: vi.fn() };
  const base = {
    rpc: rpc as never,
    contextId: "ctx",
    instanceId: "inst",
    state: { get: () => ({}), patch: async () => {}, subscribe: () => () => {} },
  };

  it("derives connection and review waiting from the rpc", async () => {
    waitForApprovalResolution.mockResolvedValue(undefined);
    const ports = createChatHostPorts(base);
    expect(ports.rpc).toBe(rpc);
    expect(ports.connection).toBe(rpc);
    expect(ports.contextId).toBe("ctx");
    expect(ports.instanceId).toBe("inst");
    expect(ports.onWorkspaceEvent).toBeUndefined();
    await ports.waitForReview?.("r");
    expect(waitForApprovalResolution).toHaveBeenCalledWith(rpc, "r");
  });

  it("wires events, an explicit waiter, and passes optional ports through", () => {
    const { client } = fakeEvents();
    const waitForReview = vi.fn(async () => {});
    const notify = vi.fn();
    const ports = createChatHostPorts({ ...base, events: client, waitForReview, notify });
    expect(ports.onWorkspaceEvent).toBeTypeOf("function");
    expect(ports.waitForReview).toBe(waitForReview);
    expect(ports.notify).toBe(notify);
    expect("events" in ports).toBe(false);
  });
});
