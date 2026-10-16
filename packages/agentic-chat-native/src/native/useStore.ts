import { useSyncExternalStore } from "react";
import type { ReadableStore } from "@workspace/agentic-core/chat-store";

/** Subscribe to a whole snapshot of a chat-core store. */
export function useStoreSnapshot<Snapshot>(store: ReadableStore<Snapshot>): Snapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** A store that may not exist yet (no session before the channel is known). */
const NOTHING: ReadableStore<null> = {
  getSnapshot: () => null,
  subscribe: () => () => undefined,
};

export function useOptionalStoreSnapshot<Snapshot>(
  store: ReadableStore<Snapshot> | null
): Snapshot | null {
  return useStoreSnapshot((store ?? NOTHING) as ReadableStore<Snapshot | null>);
}
