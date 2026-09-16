import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceProvider, RpcEnvelope } from "@vibestudio/rpc";

function provider() {
  const messages = new Set<(message: RpcEnvelope) => void>();
  const disconnected = new Set<() => void>();
  const bridge: WorkspaceProvider = {
    connect: vi.fn(async () => ({
      documentId: "document-1",
      origin: "https://example.com",
      bootstrap: {
        runtimeId: "panel:test",
        slotId: "slot:test",
        contextId: "test",
        parentId: null,
        parentEntityId: null,
        theme: "dark" as const,
      },
    })),
    disconnect: vi.fn(async () => {
      for (const listener of [...disconnected]) listener();
    }),
    onDisconnect: (listener) => {
      disconnected.add(listener);
      return () => {
        disconnected.delete(listener);
      };
    },
    postEnvelope: vi.fn(),
    onEnvelope: (listener) => {
      messages.add(listener);
      return () => {
        messages.delete(listener);
      };
    },
  };
  return { bridge, messages, disconnected };
}

afterEach(async () => {
  const runtime = await import("./defaultRuntime.js");
  await runtime.disconnectWorkspace();
  globalThis.vibestudio = undefined;
  vi.resetModules();
});

describe("default panel runtime binding", () => {
  it("publishes host revocation and retires the connected runtime without reconnecting", async () => {
    const f = provider();
    globalThis.vibestudio = f.bridge;
    const api = await import("./defaultRuntime.js");
    await api.connectWorkspace();
    const changed = vi.fn();
    const stop = api.workspaceConnection.subscribe(changed);
    for (const listener of [...f.disconnected]) listener();
    expect(api.workspaceConnection.status).toBe("disconnected");
    expect(api.workspaceConnection.connected).toBe(false);
    expect(f.disconnected.size).toBe(0);
    expect(f.messages.size).toBe(0);
    expect(f.bridge.connect).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalled();
    stop();
  });
  it("publishes pending, denied and retry states without implicit retries", async () => {
    const f = provider();
    globalThis.vibestudio = f.bridge;
    const api = await import("./defaultRuntime.js");
    const states: string[] = [];
    const stop = api.workspaceConnection.subscribe(() =>
      states.push(api.workspaceConnection.status),
    );
    vi.mocked(f.bridge.connect).mockRejectedValueOnce(new Error("Denied"));
    const attempt = api.connectWorkspace();
    expect(api.workspaceConnection.status).toBe("connecting");
    await expect(attempt).rejects.toThrow("Denied");
    expect(api.workspaceConnection.status).toBe("disconnected");
    expect(api.workspaceConnection.error).toBe("Denied");
    expect(f.bridge.connect).toHaveBeenCalledTimes(1);
    await api.connectWorkspace();
    expect(api.workspaceConnection.error).toBeNull();
    expect(api.workspaceConnection.status).toBe("connected");
    const end = api.disconnectWorkspace();
    expect(api.workspaceConnection.status).toBe("disconnecting");
    expect(api.workspaceConnection.connected).toBe(false);
    await end;
    expect(states).toContain("disconnecting");
    expect(states.at(-1)).toBe("disconnected");
    stop();
    globalThis.vibestudio = undefined;
  });
  it("imports the complete API with zero workspace interactions and does not connect implicitly", async () => {
    const f = provider();
    const api = await import("./index.js");
    const call = api.rpc.call;
    expect(api.workspaceConnection.connected).toBe(false);
    expect(() => call("main", "docs.list", [])).toThrow(/Connect this website/);
    expect(f.bridge.connect).not.toHaveBeenCalled();
    expect(f.bridge.postEnvelope).not.toHaveBeenCalled();
    expect(api.id).toBeUndefined();
  });

  it("binds the same full factory surface only after explicit connection and retires borrowed clients", async () => {
    const f = provider();
    const api = await import("./index.js");
    const instance = await api.connectWorkspace(f.bridge);
    expect(api.id).toBe("panel:test");
    expect(api.panel.getTheme()).toBe("dark");
    expect(api.panel.stateArgs.get()).toEqual({});
    expect(Object.keys(api.credentials)).toEqual(
      Object.keys(instance.credentials),
    );
    const pending = instance.rpc.call("main", "docs.list", []);
    const rejected = expect(pending).rejects.toThrow();
    await api.disconnectWorkspace();
    await rejected;
    expect(f.messages.size).toBe(0);
    expect(f.disconnected.size).toBe(0);
    expect(() => api.rpc.call("main", "docs.list", [])).toThrow(
      /Connect this website/,
    );
    expect(api.workspaceConnection.connected).toBe(false);
  });

  it("does not bind a late connection after an explicit disconnect", async () => {
    const f = provider();
    let release!: (
      value: Awaited<ReturnType<WorkspaceProvider["connect"]>>,
    ) => void;
    const result = await f.bridge.connect();
    f.bridge.connect = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const api = await import("./index.js");
    const pending = api.connectWorkspace(f.bridge);
    const rejected = expect(pending).rejects.toThrow(/Connect this website/);
    await api.disconnectWorkspace();
    release(result);
    await rejected;
    expect(api.workspaceConnection.connected).toBe(false);
    expect(f.bridge.postEnvelope).not.toHaveBeenCalled();
  });
});
