import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectViaRpc, resolveRpcChannelTarget } from "@workspace/pubsub";
import { ConnectionManager } from "./connection.js";
import type { ConnectionConfig } from "./types.js";

vi.mock("@workspace/pubsub", () => ({
  connectViaRpc: vi.fn(),
  resolveRpcChannelTarget: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function client(id: string) {
  return {
    clientId: id,
    ready: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    events: () => (async function* () {})(),
    onRoster: vi.fn(() => vi.fn()),
    onReconnect: vi.fn(() => vi.fn()),
  };
}
function manager() {
  const onError = vi.fn();
  const value = new ConnectionManager({
    config: {
      clientId: "panel",
      rpc: { selfId: "panel", call: vi.fn(), stream: vi.fn(), on: vi.fn() },
    } as ConnectionConfig,
    metadata: { name: "Panel", type: "panel" },
    callbacks: { onError },
  });
  return { value, onError };
}
const options = { channelId: "chat", methods: {} };

beforeEach(() => vi.resetAllMocks());

describe("connection attempt ownership", () => {
  it("joins the replaced resolver before connecting its successor", async () => {
    const old = deferred<string>();
    vi.mocked(resolveRpcChannelTarget)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce("channel");
    const next = client("next");
    vi.mocked(connectViaRpc).mockReturnValue(next as never);
    const { value, onError } = manager();
    const abandoned = value.connect(options);
    const rejected = expect(abandoned).rejects.toThrow("old resolution failed");
    await vi.waitFor(() =>
      expect(resolveRpcChannelTarget).toHaveBeenCalledTimes(1),
    );
    const oldSignal = vi.mocked(resolveRpcChannelTarget).mock.calls[0]![0]
      .signal;
    const replacement = value.connect(options);
    expect(oldSignal?.aborted).toBe(true);
    expect(connectViaRpc).not.toHaveBeenCalled();
    old.reject(new Error("old resolution failed"));
    await rejected;
    await replacement;
    expect(oldSignal?.aborted).toBe(true);
    expect(value.client).toBe(next);
    expect(value.connected).toBe(true);
    expect(next.close).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    await value.disconnect();
  });

  it("joins the abandoned replay and its close before connecting its successor", async () => {
    vi.mocked(resolveRpcChannelTarget).mockResolvedValue("channel");
    const replay = deferred<void>();
    const old = client("old");
    old.ready.mockReturnValue(replay.promise);
    const leave = deferred<void>();
    old.close.mockReturnValue(leave.promise);
    const next = client("next");
    vi.mocked(connectViaRpc)
      .mockReturnValueOnce(old as never)
      .mockReturnValueOnce(next as never);
    const { value, onError } = manager();
    const abandoned = value.connect(options);
    const rejected = expect(abandoned).rejects.toThrow("superseded");
    await vi.waitFor(() => expect(old.ready).toHaveBeenCalled());
    const replacement = value.connect(options);
    expect(connectViaRpc).toHaveBeenCalledTimes(1);
    replay.resolve();
    await vi.waitFor(() => expect(old.close).toHaveBeenCalledTimes(1));
    expect(connectViaRpc).toHaveBeenCalledTimes(1);
    expect(value.connected).toBe(false);
    leave.resolve();
    await rejected;
    await replacement;
    expect(old.close).toHaveBeenCalledTimes(1);
    expect(next.close).not.toHaveBeenCalled();
    expect(value.client).toBe(next);
    expect(onError).not.toHaveBeenCalled();
    await value.disconnect();
  });

  it("cancels an attempt during graceful leave without cancelling its replacement", async () => {
    vi.mocked(resolveRpcChannelTarget).mockResolvedValue("channel");
    const initial = client("initial");
    const next = client("next");
    vi.mocked(connectViaRpc)
      .mockReturnValueOnce(initial as never)
      .mockReturnValueOnce(next as never);
    const { value } = manager();
    await value.connect(options);
    const leave = deferred<void>();
    initial.close.mockReturnValue(leave.promise);
    const controller = new AbortController();
    const cancelled = value.connect({ ...options, signal: controller.signal });
    const rejected = expect(cancelled).rejects.toThrow("superseded");
    const replacement = value.connect(options);
    controller.abort();
    leave.resolve();
    await rejected;
    await replacement;
    expect(value.client).toBe(next);
    expect(initial.close).toHaveBeenCalledTimes(1);
    await value.disconnect();
  });
});
