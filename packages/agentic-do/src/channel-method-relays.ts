import type { ChannelEvent } from "@workspace/pubsub";
import { copyJson } from "@panticonic/pi-chord";
import type { ChannelClient } from "./channel-client.js";
import {
  channelMethodOriginalRequest,
  readCanonicalChannelMethodOutcome,
  type ChannelMethodCall,
  type NativeChannelMethodOutcome,
  type NativeChannelMethodRequest,
} from "./native-channel-method.js";

type Client = Pick<ChannelClient, "callMethod" | "cancelCall" | "getEnvelope">;
function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function outcomeError(outcome: NativeChannelMethodOutcome): Error {
  const value = outcome.value;
  return new Error(
    typeof value === "string" && value
      ? value
      : value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          typeof value["error"] === "string"
        ? value["error"]
        : `chat.callMethod failed (${outcome.kind})`,
  );
}

/** Activation-owned finite RPC calls. Channel truth owns admission/results;
 * these records own transport awaits and hydration until they are joined. */
export class ChannelMethodRelays {
  private released = false;
  private readonly calls = new Map<
    string,
    {
      channelId: string;
      wake: () => void;
      cancel: (reason: Error) => void;
      join: () => Promise<void>;
    }
  >();

  hint(channelId: string, event: ChannelEvent): boolean {
    const payload = event.payload as {
      kind?: unknown;
      causality?: { transportCallId?: unknown };
    } | null;
    if (
      typeof payload?.kind !== "string" ||
      !payload.kind.startsWith("invocation.")
    )
      return false;
    const callId = payload.causality?.transportCallId;
    if (typeof callId !== "string") return false;
    const owned = this.calls.get(callId);
    if (!owned || owned.channelId !== channelId) return false;
    owned.wake();
    return true;
  }

  async call(input: {
    request: NativeChannelMethodRequest;
    route: ChannelMethodCall;
    dispatch: Client;
    cleanup: Client;
    dispatchController: AbortController;
    callerSignal: AbortSignal | null;
    timeoutMs?: number;
    hydrate: (value: unknown) => Promise<unknown>;
  }): Promise<{ content: unknown }> {
    const { dispatch, cleanup, dispatchController, callerSignal } = input;
    const request: NativeChannelMethodRequest = {
      ...input.request,
      targetIds: [...input.request.targetIds],
      args: copyJson(input.request.args),
    };
    const route = { ...input.route };
    const hydrate = input.hydrate;
    const timeoutMs = input.timeoutMs;
    if (!request.targetIds.includes(route.targetId))
      throw new Error("Channel relay route is outside its original audience");
    if (this.released) throw new Error("Channel relay activation is released");
    if (this.calls.has(route.callId))
      throw new Error("Channel relay already owns this call");
    let ready = signal();
    const wake = () => {
      const previous = ready;
      ready = signal();
      previous.resolve();
    };
    let cancelled: Error | null = null;
    let dispatchFailure: unknown;
    let dispatchJoined = false;
    let cleanupJoined = false;
    let cleanupAttempt: Promise<void> | null = null;
    let cleanupFailure: unknown;
    let transport: Promise<void>;
    const close = async () => {
      if (!cleanupJoined) {
        cleanupAttempt ??= cleanup.cancelCall(
          request.callerId,
          route.callId,
          channelMethodOriginalRequest(request, route),
        );
        try {
          await cleanupAttempt;
          cleanupJoined = true;
          cleanupFailure = undefined;
        } catch (error) {
          cleanupFailure = error;
          throw error;
        } finally {
          cleanupAttempt = null;
        }
      }
      // The committed domain fence makes a delayed initial request harmless.
      // Abort only its transport await, then join it; never use local abort as
      // evidence that the domain cancelled or provider cleanup succeeded.
      dispatchController.abort(new Error("Channel relay transport joined"));
      await transport;
      dispatchJoined = true;
    };
    const onAbort = () => {
      cancelled ??=
        callerSignal?.reason instanceof Error
          ? callerSignal.reason
          : new Error("Channel relay caller cancelled");
      wake();
    };
    const owned = {
      channelId: request.channelId,
      wake,
      cancel: (reason: Error) => {
        cancelled ??= reason;
        wake();
      },
      join: async () => {
        await close();
        await completion.then(
          () => {},
          () => {},
        );
        this.calls.delete(route.callId);
      },
    };
    this.calls.set(route.callId, owned);
    callerSignal?.addEventListener("abort", onAbort, { once: true });
    if (callerSignal?.aborted) onAbort();
    transport = Promise.resolve()
      .then(async () => {
        if (cancelled) return;
        await dispatch.callMethod(
          request.callerId,
          route.targetId,
          route.callId,
          request.method,
          request.args,
          {
            invocationId: route.invocationId,
            transportCallId: route.callId,
            ...(timeoutMs && timeoutMs > 0 ? { timeoutMs } : {}),
          },
        );
      })
      .then(
        () => {
          wake();
        },
        (error) => {
          dispatchFailure = error;
          wake();
        },
      );
    const completion = (async () => {
      try {
        for (;;) {
          const changed = ready.promise;
          const outcome = await readCanonicalChannelMethodOutcome(
            cleanup,
            request,
            route,
          );
          if (
            cancelled ||
            dispatchFailure !== undefined ||
            (outcome && outcome.kind !== "invocation.completed")
          ) {
            await close();
            const settled = await readCanonicalChannelMethodOutcome(
              cleanup,
              request,
              route,
            );
            if (!settled)
              throw new Error("Channel relay cleanup has no canonical outcome");
            if (cancelled) throw cancelled;
            if (settled.kind === "invocation.completed")
              return { content: await hydrate(settled.value) };
            if (dispatchFailure !== undefined) throw dispatchFailure;
            throw outcomeError(settled);
          }
          if (outcome) {
            dispatchController.abort(
              new Error("Canonical channel relay outcome received"),
            );
            await transport;
            dispatchJoined = true;
            cleanupJoined = true;
            if (outcome.kind !== "invocation.completed")
              throw outcomeError(outcome);
            return { content: await hydrate(outcome.value) };
          }
          await changed;
        }
      } catch (original) {
        if (cleanupFailure !== undefined) {
          const originalFailure = cancelled ?? dispatchFailure ?? original;
          if (originalFailure === cleanupFailure) throw cleanupFailure;
          throw new AggregateError(
            [originalFailure, cleanupFailure],
            "Channel relay failed and cleanup remains owned",
            { cause: originalFailure },
          );
        }
        if (!cleanupJoined || !dispatchJoined) {
          try {
            await close();
          } catch (failure) {
            throw new AggregateError(
              [original, failure],
              "Channel relay failed and cleanup remains owned",
              { cause: original },
            );
          }
        }
        throw original;
      } finally {
        callerSignal?.removeEventListener("abort", onAbort);
        if (cleanupJoined && dispatchJoined) this.calls.delete(route.callId);
      }
    })();
    return completion;
  }

  async release(reason: Error): Promise<void> {
    this.released = true;
    const owned = [...this.calls.values()];
    for (const call of owned) call.cancel(reason);
    const failures = (
      await Promise.allSettled(owned.map((call) => call.join()))
    )
      .filter(
        (value): value is PromiseRejectedResult => value.status === "rejected",
      )
      .map((value) => value.reason);
    if (failures.length === 1) throw failures[0];
    if (failures.length)
      throw new AggregateError(
        failures,
        "Channel relay resource cleanup failed",
        { cause: failures[0] },
      );
  }
}
