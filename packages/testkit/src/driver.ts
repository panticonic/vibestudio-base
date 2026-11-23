import { driverRpcMethods } from "./driver-contract.js";
/**
 * Client for the testkit-driver DO (workspace/workers/testkit-driver).
 *
 * Confined callers do not open raw panel CDP sockets directly
 * (panelCdp policy); the driver DO performs those operations as a DO caller
 * under the panel-access approval flow. This module exposes the DO's
 * session protocol as a RawCdpSession and registers itself as the routing
 * route in cdp.ts — importing "@workspace/testkit" activates it.
 */
import { createDurableObjectServiceClient } from "@workspace/runtime";
import type { PanelHandle } from "@workspace/runtime";
import { _registerDriverRoute, type RawCdpSession } from "./cdp.js";
import type { ProfileRef } from "./profile-core.js";

const DRIVER_PROTOCOL = "vibestudio.testkit-driver.v1";
const EVENT_POLL_INTERVAL_MS = 250;

type DriverClient = import("@workspace/runtime").DurableObjectServiceClient<
  typeof driverRpcMethods
>;

let _client: DriverClient | null = null;

function driverClient(): DriverClient {
  _client ??= createDurableObjectServiceClient(
    DRIVER_PROTOCOL,
    driverRpcMethods,
  );
  return _client;
}

/** Driver-backed RawCdpSession: events arrive via cursor polling. */
async function openDriverSession(handle: PanelHandle): Promise<RawCdpSession> {
  const client = driverClient();
  const { sessionId } = await client.call("cdpOpen", handle.id);

  const listeners = new Map<string, Set<(params: unknown) => void>>();
  const subscriptions: Promise<void>[] = [];
  const commands = new Set<Promise<unknown>>();
  let cursor = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let closing: Promise<void> | undefined;
  let draining: Promise<void> | undefined;
  const pollFailures: unknown[] = [];

  const deliver = (
    result: import("./driver-contract.js").DriverEvents,
  ): void => {
    const failures: unknown[] = [];
    for (const event of result.events) {
      if (event.seq <= cursor) continue;
      if (event.seq !== cursor + 1)
        throw new Error(
          "CDP event buffer overflow: event stream is incomplete",
        );
      cursor = event.seq;
      for (const listener of listeners.get(event.method) ?? []) {
        try {
          listener(event.params);
        } catch (error) {
          failures.push(error);
        }
      }
    }
    cursor = Math.max(cursor, result.cursor);
    if (failures.length)
      throw new AggregateError(failures, "CDP event listeners failed");
  };
  const drain = (): Promise<void> => {
    if (closed || listeners.size === 0) return Promise.resolve();
    if (draining) return draining;
    const current = (async () => {
      await Promise.all(subscriptions);
      const result = await client.call("cdpDrainEvents", sessionId, cursor);
      if (!closed) deliver(result);
    })();
    draining = current;
    void current
      .finally(() => {
        if (draining === current) draining = undefined;
      })
      .catch(() => undefined);
    return current;
  };
  const ensurePolling = (): void => {
    pollTimer ??= setInterval(() => {
      void drain().catch((error) => {
        if (!closed) pollFailures.push(error);
      });
    }, EVENT_POLL_INTERVAL_MS);
  };

  return {
    async send(method, params) {
      if (closed) throw new Error("The CDP session is closed");
      if (pollFailures.length)
        throw new AggregateError(pollFailures, "CDP event polling failed");
      const command = (async () => {
        await Promise.all(subscriptions);
        if (closed) throw new Error("The CDP session is closed");
        const result = await client.call("cdpSend", sessionId, method, params);
        await drain();
        return result;
      })();
      commands.add(command);
      try {
        return await command;
      } finally {
        commands.delete(command);
      }
    },
    on(method, listener) {
      if (closed) throw new Error("The CDP session is closed");
      const set = listeners.get(method) ?? new Set();
      set.add(listener);
      listeners.set(method, set);
      const ready = client.call("cdpSubscribe", sessionId, method);
      subscriptions.push(ready);
      void ready.catch(() => undefined); // send/close join and report this failure.
      ensurePolling();
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(method);
      };
    },
    close() {
      if (closing) return closing;
      closed = true;
      if (pollTimer) clearInterval(pollTimer);
      // Revoke native control immediately, before joining any pending event work.
      const release = client.call("cdpClose", sessionId);
      closing = (async () => {
        const failures: unknown[] = [...pollFailures];
        try {
          deliver(await release);
        } catch (error) {
          failures.push(error);
        }
        const settled = await Promise.allSettled(subscriptions);
        for (const result of settled)
          if (result.status === "rejected") failures.push(result.reason);
        // A concurrent drain may see the session retired by close. It owns no
        // authority after native cdpClose; the final atomic event batch is above.
        if (draining) await draining.catch(() => undefined);
        await Promise.allSettled([...commands]);
        listeners.clear();
        if (failures.length === 1) throw failures[0];
        if (failures.length)
          throw new AggregateError(failures, "CDP session cleanup failed");
      })();
      return closing;
    },
  };
}

/** Fixed-duration CPU profile of any panel, captured driver-side. */
export async function driverProfilePanel(
  handle: PanelHandle | string,
  opts?: { durationMs?: number; samplingIntervalUs?: number },
): Promise<ProfileRef> {
  const panelId = typeof handle === "string" ? handle : handle.id;
  return driverClient().call("profilePanel", panelId, opts);
}

/** Heap snapshot of any panel, captured driver-side (artifact on context fs). */
export async function driverHeapSnapshot(
  handle: PanelHandle | string,
): Promise<ProfileRef> {
  const panelId = typeof handle === "string" ? handle : handle.id;
  return driverClient().call("heapSnapshot", panelId);
}

/** Readiness probe; resolving the service builds/starts the worker on demand. */
export async function driverPing(): Promise<{ ok: boolean; sessions: number }> {
  return driverClient().call("ping");
}

_registerDriverRoute(async (handle) => openDriverSession(handle));
