import { wireCallerFor } from "@vibestudio/rpc/internal";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionManager } from "./connection.js";
import type { ChatParticipantMetadata, ConnectionConfig } from "./types.js";
import { createRpcClient } from "@vibestudio/rpc";
import {
  createInProcessNetwork,
  inProcessTransport,
} from "@vibestudio/rpc/transports/inProcess";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";

const CHANNEL_TARGET = "do:workers/pubsub-channel:PubSubChannel:chat-1";

function resolvedChannelService() {
  return durableObjectServiceFixture(CHANNEL_TARGET, {
    name: "pubsub-channel",
    source: "workers/pubsub-channel",
    className: "PubSubChannel",
    objectKey: "chat-1",
    protocols: ["vibestudio.channel.v1"],
  });
}

function createConfig(
  onStream?: (controller: ReadableStreamDefaultController<Uint8Array>) => void,
): ConnectionConfig {
  const call = vi.fn((target: string, method: string) => {
    if (target === "main" && method === "workers.resolveService") {
      return Promise.resolve(resolvedChannelService());
    }
    return Promise.resolve(undefined);
  });
  return {
    clientId: "panel:panel-1",
    rpc: { ...schemaRpcMock({ call,
stream: vi.fn((_target, _method, _args, options) =>
        Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                onStream?.(controller);
                controller.enqueue(
                  new TextEncoder().encode(
                    `${JSON.stringify({
                      kind: "subscribed",
                      result: { ok: true, participantId: "panel:panel-1" },
                    })}\n`,
                  ),
                );
                options?.signal?.addEventListener(
                  "abort",
                  () => controller.close(),
                  {
                    once: true,
                  },
                );
              },
            }),
          ),
        ),
      ) }), selfId: "panel:panel-1",
on: vi.fn(() => vi.fn()) },
  };
}

const metadata: ChatParticipantMetadata = {
  name: "Panel",
  type: "panel",
};

describe("ConnectionManager", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("closes a pubsub client when a pending connect is aborted", async () => {
    const config = createConfig();
    const manager = new ConnectionManager({ config, metadata, callbacks: {} });

    const connectPromise = manager.connect({
      channelId: "chat-1",
      methods: {},
    });
    await vi.waitFor(() => {
      expect(config.rpc!.stream).toHaveBeenCalledWith(
        CHANNEL_TARGET,
        "subscribe",
        [
          "panel:panel-1",
          expect.objectContaining({
            replayMessageLimit: 50,
          }),
          expect.any(String),
        ],
        { signal: expect.any(AbortSignal) },
      );
    });
    const cancelled = expect(connectPromise).rejects.toThrow("ready aborted");
    await manager.disconnect();
    await cancelled;
    expect(config.rpc!.call).toHaveBeenCalledWith(
      CHANNEL_TARGET,
      "unsubscribe",
      ["panel:panel-1", expect.any(String)],
      undefined,
    );
  });

  it("bounds an explicit replay message limit to the canonical page maximum", async () => {
    const config = { ...createConfig(), replayMessageLimit: 1234 };
    const manager = new ConnectionManager({ config, metadata, callbacks: {} });

    const connectPromise = manager.connect({
      channelId: "chat-1",
      methods: {},
    });
    await vi.waitFor(() => {
      expect(config.rpc.stream).toHaveBeenCalledWith(
        CHANNEL_TARGET,
        "subscribe",
        [
          "panel:panel-1",
          expect.objectContaining({
            replayMessageLimit: 500,
          }),
          expect.any(String),
        ],
        { signal: expect.any(AbortSignal) },
      );
    });
    const cancelled = expect(connectPromise).rejects.toThrow("ready aborted");
    await manager.disconnect();
    await cancelled;
  });

  it("propagates a terminal stream failure before replay becomes ready", async () => {
    const config = createConfig();
    const failure = new Error("Original subscription transport failure");
    vi.mocked(config.rpc!.stream).mockImplementation(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.error(failure);
            },
          }),
        ),
    );
    const onError = vi.fn();
    const manager = new ConnectionManager({
      config,
      metadata,
      callbacks: { onError },
    });
    const connecting = manager.connect({ channelId: "chat-1", methods: {} });
    void connecting.catch(() => undefined);
    try {
      await expect(connecting).rejects.toThrow(failure.message);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: failure.message }),
      );
      expect(manager.status).toBe("disconnected");
    } finally {
      await manager.disconnect();
      await connecting.catch(() => undefined);
    }
  });

  it("propagates the original service-resolution failure", async () => {
    const config = createConfig();
    const failure = new Error("Original service resolution failure");
    config.rpc!.call = vi.fn(async () => {
      throw failure;
    });
    const onError = vi.fn();
    const manager = new ConnectionManager({
      config,
      metadata,
      callbacks: { onError },
    });
    await expect(
      manager.connect({ channelId: "chat-1", methods: {} }),
    ).rejects.toBe(failure);
    expect(config.rpc!.stream).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(failure);
    expect(manager.status).toBe("disconnected");
    await manager.disconnect();
  });
});

describe("ConnectionManager owned readiness", () => {
  afterEach(() => vi.useRealTimers());

  const sendReady = (
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    controller.enqueue(
      new TextEncoder().encode(
        `${JSON.stringify({
          kind: "message",
          payload: {
            channelId: "chat-1",
            message: {
              kind: "control",
              type: "ready",
              ready: {
                contextId: "ctx-chat",
                totalCount: 0,
                envelopeCount: 0,
                hasMoreBefore: false,
              },
            },
          },
        })}\n`,
      ),
    );
  };

  it("keeps slow service resolution alive until the actual RPC reply", async () => {
    vi.useFakeTimers();
    let resolveService!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveService = resolve;
    });
    const entered = vi.fn();
    const network = createInProcessNetwork();
    const caller = createRpcClient({
      selfId: "panel:panel-1",
      callerKind: "panel",
      transport: inProcessTransport("panel:panel-1", network),
    });
    const server = createRpcClient({
      selfId: "main",
      callerKind: "server",
      transport: inProcessTransport("main", network),
    });
    server.expose(
      "workers.resolveService",
      async () => {
        entered();
        await gate;
        return resolvedChannelService();
      },
      {
        kind: "eligible",
        rationale: "This fixture accepts the channel discovery caller.",
      },
    );
    const channel = createRpcClient({
      selfId: CHANNEL_TARGET,
      callerKind: "worker",
      transport: inProcessTransport(CHANNEL_TARGET, network),
    });
    channel.expose("unsubscribe", async () => undefined, {
      kind: "eligible",
      rationale: "This fixture accepts the subscription owner leaving.",
    });
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const config = createConfig((controller) => {
      stream = controller;
    });
    config.rpc!.call = caller.call.bind(caller);
    const onError = vi.fn();
    const manager = new ConnectionManager({
      config,
      metadata,
      callbacks: { onError },
    });
    const connecting = manager.connect({ channelId: "chat-1", methods: {} });
    let outcome: unknown;
    void connecting.then(
      (value) => {
        outcome = value;
      },
      (error) => {
        outcome = error;
      },
    );
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(entered).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(outcome).toBeUndefined();
      expect(manager.status).toBe("connecting");
      expect(onError).not.toHaveBeenCalled();
      resolveService();
      await vi.advanceTimersByTimeAsync(0);
      sendReady(stream);
      await expect(connecting).resolves.toMatchObject({
        contextId: "ctx-chat",
      });
      expect(manager.connected).toBe(true);
    } finally {
      resolveService();
      await manager.disconnect();
      await connecting.catch(() => undefined);
    }
  });

  it("keeps slow replay alive until the actual ready boundary", async () => {
    vi.useFakeTimers();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const config = createConfig((controller) => {
      stream = controller;
    });
    const onError = vi.fn();
    const manager = new ConnectionManager({
      config,
      metadata,
      callbacks: { onError },
    });
    const connecting = manager.connect({ channelId: "chat-1", methods: {} });
    let settled = false;
    void connecting.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    try {
      await vi.advanceTimersByTimeAsync(60_000);
      expect(settled).toBe(false);
      expect(manager.status).toBe("connecting");
      expect(onError).not.toHaveBeenCalled();
      sendReady(stream);
      await expect(connecting).resolves.toMatchObject({
        contextId: "ctx-chat",
      });
      expect(manager.connected).toBe(true);
    } finally {
      await manager.disconnect();
      await connecting.catch(() => undefined);
    }
  });

  it("joins pending subscription retirement before disconnect completes", async () => {
    const config = createConfig();
    let finishLeave!: () => void;
    const leaving = new Promise<void>((resolve) => {
      finishLeave = resolve;
    });
    const originalCall = wireCallerFor(config.rpc!).call;
    config.rpc!.call = schemaRpcMock({ call: vi.fn((target, method, args, options) =>
      method === "unsubscribe"
        ? leaving
        : originalCall(target, method, args, options),
    ) }).call;
    const manager = new ConnectionManager({ config, metadata, callbacks: {} });
    const connecting = manager.connect({ channelId: "chat-1", methods: {} });
    void connecting.catch(() => undefined);
    await vi.waitFor(() => expect(config.rpc!.stream).toHaveBeenCalledOnce());
    const disconnected = manager.disconnect();
    let retired = false;
    void disconnected.then(() => {
      retired = true;
    });
    try {
      await vi.waitFor(() =>
        expect(config.rpc!.call).toHaveBeenCalledWith(
          CHANNEL_TARGET,
          "unsubscribe",
          expect.any(Array),
          undefined,
        ),
      );
      expect(retired).toBe(false);
    } finally {
      finishLeave();
      await disconnected;
      await connecting.catch(() => undefined);
    }
    expect(retired).toBe(true);
  });
});

it("preserves the pending owner when a replacement is already cancelled", async () => {
  const config = createConfig();
  let finishLeave!: () => void;
  const leaving = new Promise<void>((resolve) => {
    finishLeave = resolve;
  });
  const originalCall = wireCallerFor(config.rpc!).call;
  config.rpc!.call = schemaRpcMock({ call: vi.fn((target, method, args, options) =>
    method === "unsubscribe"
      ? leaving
      : originalCall(target, method, args, options),
  ) }).call;
  const manager = new ConnectionManager({ config, metadata, callbacks: {} });
  const connecting = manager.connect({ channelId: "chat-1", methods: {} });
  void connecting.catch(() => undefined);
  await vi.waitFor(() => expect(config.rpc!.stream).toHaveBeenCalledOnce());
  const cancelled = new AbortController();
  const reason = new Error("Cancelled replacement");
  cancelled.abort(reason);
  await expect(
    manager.connect({
      channelId: "chat-1",
      methods: {},
      signal: cancelled.signal,
    }),
  ).rejects.toBe(reason);
  const disconnected = manager.disconnect();
  let retired = false;
  void disconnected.then(() => {
    retired = true;
  });
  try {
    await vi.waitFor(() =>
      expect(config.rpc!.call).toHaveBeenCalledWith(
        CHANNEL_TARGET,
        "unsubscribe",
        expect.any(Array),
        undefined,
      ),
    );
    expect(retired).toBe(false);
  } finally {
    finishLeave();
    await disconnected;
    await connecting.catch(() => undefined);
  }
  expect(retired).toBe(true);
});

describe("Native-owner readiness cancellation", () => {
  afterEach(() => vi.useRealTimers());
  it("keeps a slow replay owned until explicit cancellation", async () => {
    vi.useFakeTimers();
    const config = createConfig();
    const onError = vi.fn();
    const manager = new ConnectionManager({
      config,
      metadata,
      callbacks: { onError },
    });
    const attempt = manager.connect({ channelId: "chat-1", methods: {} });
    let settled = false;
    void attempt.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);
    expect(manager.status).toBe("connecting");
    expect(onError).not.toHaveBeenCalled();
    const rejected = expect(attempt).rejects.toThrow("ready aborted");
    await manager.disconnect();
    await rejected;
    expect(manager.status).toBe("disconnected");
  });
  it("propagates the owning service failure without imposing a readiness deadline", async () => {
    vi.useFakeTimers();
    const config = createConfig();
    const original = new Error("Channel service bootstrap failed");
    let fail!: (reason: unknown) => void;
    config.rpc!.call = schemaRpcMock({ call: vi.fn((target, method) => {
      if (target === "main" && method === "workers.resolveService") {
        return new Promise((_resolve, reject) => {
          fail = reject;
        });
      }
      return Promise.resolve(undefined);
    }) }).call;
    const manager = new ConnectionManager({ config, metadata, callbacks: {} });
    const attempt = manager.connect({ channelId: "chat-1", methods: {} });
    let settled = false;
    void attempt.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);
    expect(config.rpc!.call).toHaveBeenCalledWith(
      "main",
      "workers.resolveService",
      ["vibestudio.channel.v1", "chat-1"],
      { signal: expect.any(AbortSignal) },
    );
    const rejected = expect(attempt).rejects.toBe(original);
    fail(original);
    await rejected;
    expect(manager.status).toBe("disconnected");
  });
});
