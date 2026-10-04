import { afterEach, expect, it, vi } from "vitest";
import { createRpcClient } from "@vibestudio/rpc";
import {
  createInProcessNetwork,
  inProcessTransport,
} from "@vibestudio/rpc/transports/inProcess";
import { connectViaRpc } from "./rpc-client.js";

const target = "do:workers/pubsub-channel:PubSubChannel:held-close";
const participant = "panel:held-close";
afterEach(() => vi.useRealTimers());

it("keeps cooperative leave owned until the actual RPC acknowledgment", async () => {
  vi.useFakeTimers();
  const network = createInProcessNetwork();
  const caller = createRpcClient({
    selfId: participant,
    callerKind: "panel",
    transport: inProcessTransport(participant, network),
  });
  const channel = createRpcClient({
    selfId: target,
    callerKind: "worker",
    transport: inProcessTransport(target, network),
  });
  let acknowledge!: () => void;
  const gate = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  const entered = vi.fn();
  channel.expose(
    "unsubscribe",
    async () => {
      entered();
      await gate;
    },
    {
      kind: "eligible",
      rationale:
        "The fixture permits the admitted subscription owner to leave.",
    },
  );
  let subscriptionAborted = false;
  const client = connectViaRpc({
    channel: "held-close",
    channelTargetId: target,
    rpc: {
      selfId: participant,
      call: caller.call.bind(caller),
      stream: async (_target, _method, _args, options) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              const frames = [
                {
                  kind: "subscribed",
                  result: { ok: true, participantId: participant },
                },
                {
                  kind: "message",
                  payload: {
                    channelId: "held-close",
                    message: {
                      kind: "control",
                      type: "ready",
                      ready: {
                        contextId: "ctx-held-close",
                        totalCount: 0,
                        envelopeCount: 0,
                        hasMoreBefore: false,
                      },
                    },
                  },
                },
              ];
              controller.enqueue(
                new TextEncoder().encode(
                  frames.map((frame) => JSON.stringify(frame) + "\n").join(""),
                ),
              );
              options?.signal?.addEventListener(
                "abort",
                () => {
                  subscriptionAborted = true;
                  controller.close();
                },
                { once: true },
              );
            },
          }),
        ),
    },
  });
  await vi.advanceTimersByTimeAsync(0);
  await client.ready();
  const closing = client.close();
  expect(client.close()).toBe(closing);
  let outcome: unknown;
  void closing.then(
    () => {
      outcome = "retired";
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
    expect(subscriptionAborted).toBe(false);
    acknowledge();
    await closing;
    expect(subscriptionAborted).toBe(true);
  } finally {
    acknowledge();
    await closing.catch(() => undefined);
  }
});
