import { describe, expect, it, vi } from "vitest";
import {
  ownModelSettingsRequest,
  ownModelSettingsConnection,
} from "./model-settings-request.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("model discovery request lifecycle", () => {
  it("does not manufacture a result while its original readiness remains pending", async () => {
    vi.useFakeTimers();
    try {
      const read = deferred<string>();
      const publish = vi.fn();
      const owned = ownModelSettingsRequest(() => read.promise);
      const joined = owned.promise.then(publish);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(publish).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      read.resolve("local:original");
      await joined;
      expect(publish).toHaveBeenCalledWith("local:original");
    } finally {
      vi.useRealTimers();
    }
  });
  it("propagates the original discovery failure to the waiting launch", async () => {
    const failure = new Error("original provider discovery failed");
    const owned = ownModelSettingsRequest(async () => {
      throw failure;
    });
    await expect(owned.promise).rejects.toBe(failure);
    await owned.cancel(new Error("panel closed")); // settled errors are not resource debt
  });
  it("cancels and joins the original read before closure reports success", async () => {
    const body = deferred<string>();
    let signal!: AbortSignal;
    const owned = ownModelSettingsRequest(async (bound) => {
      signal = bound;
      return body.promise;
    });
    await Promise.resolve();
    const reason = new Error("panel closed");
    const cancelled = owned.promise.catch((error: unknown) => error);
    let closed = false;
    const closing = owned.cancel(reason).then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(signal.aborted).toBe(true);
    expect(closed).toBe(false);
    body.resolve("obsolete cloud response");
    await closing;
    expect(await cancelled).toBe(reason);
  });
  it("retains an original read failure arriving during cancellation", async () => {
    const body = deferred<string>();
    const owned = ownModelSettingsRequest(() => body.promise);
    await Promise.resolve();
    const original = new Error("original transport cleanup failed");
    const observed = owned.promise.catch((error: unknown) => error);
    const closing = owned.cancel(new Error("disconnected"));
    body.reject(original);
    await expect(closing).rejects.toBe(original);
    expect(await observed).toBe(original);
  });
  it("does not start a read after its owning panel already closed", async () => {
    const read = vi.fn(async () => "unused");
    const owned = ownModelSettingsRequest(read);
    const reason = new Error("unmounted before discovery");
    const observed = owned.promise.catch((error: unknown) => error);
    await owned.cancel(reason);
    expect(read).not.toHaveBeenCalled();
    expect(await observed).toBe(reason);
  });
});

describe("model discovery connection transitions", () => {
  function connection() {
    let status: import("@vibestudio/rpc").RpcConnectionStatus = "connected";
    const listeners = new Set<(value: typeof status) => void>();
    const recoveryListeners = new Set<
      (kind: "resubscribe" | "cold-recover") => void
    >();
    return {
      status: () => status,
      onStatusChange(fn: (value: typeof status) => void) {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
      set(value: typeof status) {
        status = value;
        for (const fn of listeners) fn(value);
      },
      onRecovery(fn: (kind: "resubscribe" | "cold-recover") => void) {
        recoveryListeners.add(fn);
        return () => recoveryListeners.delete(fn);
      },
      recover(kind: "resubscribe" | "cold-recover" = "resubscribe") {
        for (const fn of recoveryListeners) fn(kind);
      },
      listeners,
      recoveryListeners,
    };
  }
  it("joins the old request and rejects an obsolete reconnect before refreshing", async () => {
    const rpc = connection();
    const body = deferred<string>();
    const request = ownModelSettingsRequest(() => body.promise);
    const observed = request.promise.catch((error: unknown) => error);
    await Promise.resolve();
    const reconnect = vi.fn();
    const invalidate = vi.fn();
    const failure = vi.fn();
    const close = ownModelSettingsConnection(rpc, {
      current: () => request,
      reconnect,
      invalidate,
      failure,
    });
    rpc.set("disconnected");
    rpc.set("connected");
    rpc.set("disconnected");
    body.resolve("obsolete response");
    await observed;
    await Promise.resolve();
    expect(reconnect).not.toHaveBeenCalled();
    rpc.set("connected");
    rpc.recover();
    await Promise.resolve();
    await Promise.resolve();
    expect(reconnect).toHaveBeenCalledTimes(1);
    // Each lost status invalidates immediately, and the authoritative recovery
    // boundary retires any observation that survived without a status edge.
    expect(invalidate).toHaveBeenCalledTimes(3);
    await close();
    expect(rpc.listeners.size).toBe(0);
    expect(rpc.recoveryListeners.size).toBe(0);
  });
  it("joins panel disposal and never refreshes after it was closed", async () => {
    const rpc = connection();
    const body = deferred<string>();
    const request = ownModelSettingsRequest(() => body.promise);
    const observed = request.promise.catch((error: unknown) => error);
    await Promise.resolve();
    const reconnect = vi.fn();
    const close = ownModelSettingsConnection(rpc, {
      current: () => request,
      reconnect,
      invalidate: vi.fn(),
      failure: vi.fn(),
    });
    rpc.set("disconnected");
    rpc.set("connected");
    let closed = false;
    const joined = close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    body.resolve("obsolete");
    await observed;
    await joined;
    expect(reconnect).not.toHaveBeenCalled();
    expect(rpc.listeners.size).toBe(0);
    expect(rpc.recoveryListeners.size).toBe(0);
  });

  it("refreshes an initial status-only connection without a recovery replay", async () => {
    const rpc = connection();
    rpc.set("connecting");
    const reconnect = vi.fn();
    const close = ownModelSettingsConnection(rpc, {
      current: () => null,
      reconnect,
      invalidate: vi.fn(),
      failure: vi.fn(),
    });

    rpc.set("connected");
    await Promise.resolve();
    expect(reconnect).toHaveBeenCalledOnce();
    await close();
  });

  it("joins and replaces discovery on recovery without a status transition", async () => {
    const rpc = connection();
    const body = deferred<string>();
    const request = ownModelSettingsRequest(() => body.promise);
    const observed = request.promise.catch((error: unknown) => error);
    await Promise.resolve();
    const reconnect = vi.fn();
    const invalidate = vi.fn();
    const close = ownModelSettingsConnection(rpc, {
      current: () => request,
      reconnect,
      invalidate,
      failure: vi.fn(),
    });

    rpc.recover("cold-recover");
    expect(invalidate).toHaveBeenCalledOnce();
    expect(reconnect).not.toHaveBeenCalled();
    body.resolve("obsolete");
    await observed;
    await Promise.resolve();
    expect(reconnect).toHaveBeenCalledOnce();

    await close();
  });

  it("reports a retired request failure once before starting the fresh generation", async () => {
    const rpc = connection();
    const body = deferred<string>();
    const request = ownModelSettingsRequest(() => body.promise);
    const observed = request.promise.catch((error: unknown) => error);
    await Promise.resolve();
    const reconnect = vi.fn();
    const failure = vi.fn();
    const close = ownModelSettingsConnection(rpc, {
      current: () => request,
      reconnect,
      invalidate: vi.fn(),
      failure,
    });
    const original = new Error("discovery cleanup failed");

    rpc.recover();
    body.reject(original);
    await observed;
    await Promise.resolve();
    expect(failure).toHaveBeenCalledOnce();
    expect(failure).toHaveBeenCalledWith(original);
    expect(reconnect).toHaveBeenCalledOnce();

    await expect(close()).rejects.toBe(original);
  });
});
