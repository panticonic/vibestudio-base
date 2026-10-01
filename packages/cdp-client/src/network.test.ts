import { describe, it, expect, vi } from "vitest";
import { NetworkObserver, type NetworkTransport } from "./network";
function fixture() {
  const listeners = new Map<string, Set<(p: unknown) => void>>();
  const closed = new Set<(error: Error) => void>();
  const send = vi.fn(async () => ({ body: "AP9B", base64Encoded: true }));
  const transport: NetworkTransport = {
    send,
    on(method, fn) {
      const set = listeners.get(method) ?? new Set();
      set.add(fn);
      listeners.set(method, set);
      return () => set.delete(fn);
    },
    onDisconnect(fn) {
      closed.add(fn);
      return () => closed.delete(fn);
    },
  };
  const network = new NetworkObserver(transport);
  const emit = (method: string, payload: unknown) => {
    for (const fn of listeners.get(method) ?? []) fn(payload);
  };
  const start = (id = "1") =>
    emit("Network.requestWillBeSent", {
      requestId: id,
      request: {
        url: "https://example.com/api",
        method: "POST",
        headers: { Accept: "application/json" },
        postData: "payload",
      },
      type: "Fetch",
      frameId: "main",
    });
  const response = (id = "1") =>
    emit("Network.responseReceived", {
      requestId: id,
      response: {
        url: "https://example.com/api",
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "text/plain" },
      },
    });
  return {
    network,
    emit,
    start,
    response,
    send,
    closed,
    disconnect(error: Error) {
      network.close(error);
      for (const fn of [...closed]) fn(error);
    },
  };
}
describe("network observations", () => {
  it("captures requests and reads binary bodies only after native completion", async () => {
    const h = fixture();
    const observed = h.network.waitForResponse((r) => r.status() === 200);
    h.start();
    h.response();
    const response = await observed;
    expect(response.request().postData()).toBe("payload");
    const body = response.body();
    expect(h.send).not.toHaveBeenCalled();
    h.emit("Network.loadingFinished", { requestId: "1" });
    expect(await body).toEqual(new Uint8Array([0, 255, 65]));
    expect(h.closed.size).toBe(0);
  });
  it("propagates native blocked/CORS/cancellation failure through body readers", async () => {
    const h = fixture();
    h.start();
    h.response();
    const response = h.network.requests()[0]!.response()!;
    const body = response.body();
    const failure = {
      errorText: "net::ERR_BLOCKED_BY_CLIENT",
      blockedReason: "inspector",
      canceled: true,
    };
    const rejected = expect(body).rejects.toThrow(failure.errorText);
    h.emit("Network.loadingFailed", { requestId: "1", ...failure });
    await rejected;
    expect(response.request().failure()).toMatchObject(failure);
    expect(h.send).not.toHaveBeenCalled();
  });
  it("preserves redirects without pretending Chromium retains their bodies", async () => {
    const h = fixture();
    h.start();
    h.emit("Network.requestWillBeSent", {
      requestId: "1",
      request: { url: "https://example.com/final", method: "GET", headers: {} },
      type: "Document",
      redirectResponse: {
        url: "https://example.com/api",
        status: 302,
        statusText: "Found",
        headers: { Location: "/final" },
      },
    });
    const [first, second] = h.network.requests();
    expect(second!.redirectedFrom()).toBe(first);
    await first!.finished();
    await expect(first!.response()!.body()).rejects.toThrow(
      "redirect response bodies",
    );
  });
  it("settles pending response and completion waits on the original disconnect", async () => {
    const h = fixture();
    h.start();
    const error = new Error("native provider lost");
    const response = expect(h.network.waitForResponse(/api/)).rejects.toBe(
      error,
    );
    const finished = expect(h.network.requests()[0]!.finished()).rejects.toBe(
      error,
    );
    h.disconnect(error);
    await Promise.all([response, finished]);
    expect(h.closed.size).toBe(0);
  });
  it("rejects predicate errors and unsubscribes the failed waiter", async () => {
    const h = fixture();
    const error = new Error("bad predicate");
    const failed = expect(
      h.network.waitForResponse(() => {
        throw error;
      }),
    ).rejects.toBe(error);
    h.start();
    h.response();
    await failed;
    expect(h.closed.size).toBe(0);
  });
  it("bounds retained observations by capacity without expiring active requests", async () => {
    const h = fixture();
    h.start("old");
    const oldest = h.network.requests()[0]!;
    for (let i = 0; i < 1001; i++) h.start(String(i));
    expect(h.network.requests()).toHaveLength(1000);
    h.emit("Network.loadingFinished", { requestId: "old" });
    await oldest.finished();
    h.disconnect(new Error("test complete"));
  });
  it("keeps child frame request IDs and body ownership separate", async () => {
    const h = fixture();
    const listeners = new Map<string, (p: unknown) => void>();
    const childSend = vi.fn(async () => ({
      body: "child",
      base64Encoded: false,
    }));
    const child: NetworkTransport = {
      send: childSend,
      on: (name, cb) => {
        listeners.set(name, cb);
        return () => {
          listeners.delete(name);
        };
      },
      onDisconnect: () => () => {},
    };
    h.network.attach(child);
    h.start("1");
    listeners.get("Network.requestWillBeSent")!({
      requestId: "1",
      request: { url: "https://child.example", method: "GET", headers: {} },
      type: "Fetch",
    });
    listeners.get("Network.responseReceived")!({
      requestId: "1",
      response: {
        url: "https://child.example",
        status: 200,
        statusText: "OK",
        headers: {},
      },
    });
    listeners.get("Network.loadingFinished")!({ requestId: "1" });
    expect(await h.network.requests()[1]!.response()!.text()).toBe("child");
    expect(childSend).toHaveBeenCalledWith("Network.getResponseBody", {
      requestId: "1",
    });
    expect(h.send).not.toHaveBeenCalled();
    h.emit("Network.loadingFinished", { requestId: "1" });
    await h.network.requests()[0]!.finished();
    h.network.close(new Error("done"));
    expect(listeners.size).toBe(0);
  });
});
