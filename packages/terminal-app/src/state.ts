/**
 * A terminal app's durable per-session state: its panel runtime's stateArgs
 * (the same per-instance state a panel shown in a view keeps on its slot).
 * Patches are RFC 7386 merge patches (`null` deletes a key), validated by the
 * server against the app's declared `stateArgs` schema; the state survives
 * detach, a lost connection and a relaunch of the program.
 */
import type { RpcClient } from "@vibestudio/rpc";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";

export interface SessionStateStore {
  /** The latest committed state. */
  get(): Readonly<Record<string, unknown>>;
  /** Merge `partial` into the state; resolves once it is durable. */
  patch(partial: Record<string, unknown>): Promise<void>;
  /** Called after every committed change. */
  subscribe(listener: () => void): () => void;
}

export function sessionStateStore(
  rpc: Pick<RpcClient, "call">,
  initial: Record<string, unknown>
): SessionStateStore {
  let state: Readonly<Record<string, unknown>> = initial;
  const listeners = new Set<() => void>();
  // Patches apply in order, each on the server's latest state.
  let queue: Promise<unknown> = Promise.resolve();
  return {
    get: () => state,
    patch(partial) {
      const next = queue.then(async () => {
        state = await rpc.call("main", mainRpcMethods["runtime.patchEntityStateArgs"], [partial]);
        for (const listener of [...listeners]) listener();
      });
      queue = next.catch(() => undefined);
      return next;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
