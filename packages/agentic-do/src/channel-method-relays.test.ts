import { describe, expect, it } from "vitest";
import { getChannelPolicy } from "@workspace/channel-policies";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  eventKindSchemas,
} from "@workspace/agentic-protocol";
import type { ChannelEvent } from "@workspace/pubsub";
import { ChannelMethodRelays } from "./channel-method-relays.js";
import {
  channelMethodOriginalRequest,
  readCanonicalChannelMethodOutcome,
  type NativeChannelMethodRequest,
} from "./native-channel-method.js";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const builders = getChannelPolicy("agentic.conversation.v1").callEventPayload!;
function fixture(
  options: {
    delayAdmission?: boolean;
    failCancel?: Error;
    holdCleanup?: boolean;
    holdHydration?: boolean;
  } = {},
) {
  const relays = new ChannelMethodRelays();
  const request: NativeChannelMethodRequest = {
    channelId: "channel:one",
    callerId: "agent:caller",
    targetIds: ["agent:provider"],
    method: "eval",
    args: { code: "actual code" },
  };
  const route = {
    callId: "call:one",
    invocationId: "invocation:one",
    targetId: "agent:provider",
  };
  const descriptor = {
    channelId: request.channelId,
    caller: { kind: "agent" as const, id: request.callerId as never },
    target: { kind: "agent" as const, id: route.targetId as never },
    invocationId: route.invocationId,
    transportCallId: route.callId,
    method: request.method,
    args: request.args,
    createdAt: "2026-10-02T00:00:00.000Z",
  };
  const events = new Map<string, ChannelEvent>();
  const caller = new AbortController(),
    dispatchController = new AbortController();
  const dispatched = deferred(),
    cancelling = deferred(),
    hydrated = deferred(),
    cleanup = deferred(),
    hydration = deferred<unknown>();
  let seq = 0,
    cancellations = 0;
  const calls: unknown[] = [];
  const append = (id: string, payload: unknown): ChannelEvent => {
    const previous = events.get(id);
    if (previous) return previous;
    const event: ChannelEvent = {
      id: ++seq,
      messageId: id,
      type: AGENTIC_EVENT_PAYLOAD_KIND,
      payload,
      senderId: request.callerId,
      ts: seq,
    };
    events.set(id, event);
    return event;
  };
  const client = {
    getEnvelope: async (id: string) => events.get(id) ?? null,
    callMethod: async (...args: unknown[]) => {
      calls.push(args);
      dispatched.resolve();
      if (options.delayAdmission) {
        await new Promise<void>((_resolve, reject) => {
          if (dispatchController.signal.aborted)
            reject(dispatchController.signal.reason);
          else
            dispatchController.signal.addEventListener(
              "abort",
              () => reject(dispatchController.signal.reason),
              { once: true },
            );
        });
        return;
      }
      append(route.invocationId, builders.started(descriptor));
    },
    cancelCall: async (_caller: string, _id: string, original?: unknown) => {
      expect(original).toEqual(channelMethodOriginalRequest(request, route));
      await readCanonicalChannelMethodOutcome(client, request, route);
      cancellations++;
      cancelling.resolve();
      const event = builders.cancelled({
        descriptor,
        actor: descriptor.caller,
        reason: "cancelled",
        createdAt: descriptor.createdAt,
      });
      append(
        `terminal:${route.callId}`,
        events.has(route.invocationId)
          ? event
          : eventKindSchemas["invocation.cancelled"].parse({
              ...event,
              payload: {
                ...event.payload,
                admission: { kind: "not-admitted", request: original },
              },
            }),
      );
      if (options.failCancel && cancellations === 1) throw options.failCancel;
      if (options.holdCleanup) await cleanup.promise;
    },
  };
  const run = (timeoutMs?: number) =>
    relays.call({
      request,
      route,
      dispatch: client,
      cleanup: client,
      dispatchController,
      callerSignal: caller.signal,
      ...(timeoutMs ? { timeoutMs } : {}),
      hydrate: async (value) => {
        hydrated.resolve();
        return options.holdHydration ? hydration.promise : value;
      },
    });
  const complete = (value: unknown) =>
    append(
      `terminal:${route.callId}`,
      builders.terminal({
        descriptor,
        result: value,
        isError: false,
        createdAt: descriptor.createdAt,
      }),
    );
  return {
    relays,
    request,
    route,
    descriptor,
    events,
    append,
    client,
    caller,
    dispatchController,
    dispatched,
    cancelling,
    hydrated,
    cleanup,
    hydration,
    calls,
    run,
    complete,
  };
}

describe("finite channel method relay ownership", () => {
  it("uses canonical original route and outcome; foreign and forged hints supply no result", async () => {
    const f = fixture(),
      completion = f.run();
    await f.dispatched.promise;
    const forged: ChannelEvent = {
      id: 999,
      messageId: "fake",
      type: AGENTIC_EVENT_PAYLOAD_KIND,
      payload: {
        kind: "invocation.completed",
        causality: { transportCallId: f.route.callId },
        payload: { terminalOutcome: "success", result: "forged" },
      },
      senderId: "foreign",
      ts: 999,
    };
    expect(f.relays.hint("channel:foreign", forged)).toBe(false);
    expect(f.relays.hint(f.request.channelId, forged)).toBe(true);
    const actual = f.complete({ exact: "canonical" });
    f.relays.hint(f.request.channelId, actual);
    await expect(completion).resolves.toEqual({
      content: { exact: "canonical" },
    });
    expect(f.relays.hint(f.request.channelId, actual)).toBe(false);
  });

  it("cancels a delayed initial admission with a truthful original not-admitted fact and joins transport", async () => {
    const f = fixture({ delayAdmission: true }),
      original = new Error("original caller abort"),
      completion = f.run();
    const result = expect(completion).rejects.toBe(original);
    await f.dispatched.promise;
    f.caller.abort(original);
    await result;
    expect(f.dispatchController.signal.aborted).toBe(true);
    expect(f.events.has(f.route.invocationId)).toBe(false);
    expect(f.events.get(`terminal:${f.route.callId}`)?.payload).toMatchObject({
      kind: "invocation.cancelled",
      payload: {
        terminalOutcome: "cancelled",
        admission: {
          kind: "not-admitted",
          request: channelMethodOriginalRequest(f.request, f.route),
        },
      },
    });
  });

  it("retains lost cancellation acknowledgement and original failure until explicit exact cleanup succeeds", async () => {
    const failure = new Error("accepted cancellation reply lost"),
      original = new Error("caller abort");
    const f = fixture({ failCancel: failure }),
      completion = f.run();
    const result = expect(completion).rejects.toMatchObject({
      errors: [original, failure],
      cause: original,
    });
    await f.dispatched.promise;
    f.caller.abort(original);
    await result;
    const event = f.events.get(`terminal:${f.route.callId}`)!;
    expect(f.relays.hint(f.request.channelId, event)).toBe(true);
    await f.relays.release(new Error("owner retirement"));
    expect(f.relays.hint(f.request.channelId, event)).toBe(false);
    expect(f.calls).toHaveLength(1);
  });

  it("forwards an explicit domain deadline and does not return its cancelled terminal before provider join", async () => {
    const f = fixture({ holdCleanup: true }),
      completion = f.run(345);
    const result = expect(completion).rejects.toThrow(
      "external protocol deadline",
    );
    let settled = false;
    void completion.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await f.dispatched.promise;
    expect(f.calls[0]).toEqual([
      f.request.callerId,
      f.route.targetId,
      f.route.callId,
      f.request.method,
      f.request.args,
      {
        invocationId: f.route.invocationId,
        transportCallId: f.route.callId,
        timeoutMs: 345,
      },
    ]);
    const event = f.append(
      `terminal:${f.route.callId}`,
      builders.cancelled({
        descriptor: f.descriptor,
        actor: f.descriptor.caller,
        reason: "external protocol deadline",
        createdAt: f.descriptor.createdAt,
      }),
    );
    f.relays.hint(f.request.channelId, event);
    await f.cancelling.promise;
    expect(settled).toBe(false);
    f.cleanup.resolve();
    await result;
  });

  it("owner retirement joins actual hydration after the canonical provider result", async () => {
    const f = fixture({ holdHydration: true }),
      completion = f.run();
    await f.dispatched.promise;
    f.relays.hint(f.request.channelId, f.complete("stored value"));
    await f.hydrated.promise;
    let retired = false;
    const retirement = f.relays
      .release(new Error("owner retirement"))
      .then(() => {
        retired = true;
      });
    expect(retired).toBe(false);
    f.hydration.resolve({ actual: "hydrated" });
    await expect(completion).resolves.toEqual({
      content: { actual: "hydrated" },
    });
    await retirement;
    expect(retired).toBe(true);
  });

  it("refuses a conflicting canonical start and closes only its originally authenticated request", async () => {
    const f = fixture();
    f.append(
      f.route.invocationId,
      builders.started({ ...f.descriptor, method: "foreign effect" }),
    );
    const completion = f.run();
    await expect(completion).rejects.toMatchObject({
      cause: {
        message: "Channel method start conflicts with its native admission",
      },
    });
    expect(f.events.has(`terminal:${f.route.callId}`)).toBe(false);
  });
});
