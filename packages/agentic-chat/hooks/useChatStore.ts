/**
 * React bindings for the framework-free chat stores in
 * `@workspace/agentic-core/chat-store`.
 *
 * Stores live outside React. A component reads a slice with
 * `useChatStore(store, selector)`; only a change of that slice (by identity, or
 * by the supplied equality) re-renders it. `useRetainedStore` owns a store's
 * lifetime through its reference count, so StrictMode's mount → unmount →
 * remount reuses one instance instead of opening a second connection.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import type { ChatMethodProvider, ReadableStore } from "@workspace/agentic-core/chat-store";

/** Subscribe to a slice of a store snapshot. */
export function useChatStore<Snapshot, Slice>(
  store: ReadableStore<Snapshot>,
  selector: (snapshot: Snapshot) => Slice,
  isEqual: (a: Slice, b: Slice) => boolean = Object.is
): Slice {
  // The cached selection keeps a stable result for an unchanged snapshot and
  // for an equal slice of a changed snapshot.
  const cache = useRef<{ snapshot: Snapshot; slice: Slice } | null>(null);
  const select = useCallback(() => {
    const snapshot = store.getSnapshot();
    const cached = cache.current;
    if (cached && cached.snapshot === snapshot) return cached.slice;
    const slice = selector(snapshot);
    if (cached && isEqual(cached.slice, slice)) {
      cache.current = { snapshot, slice: cached.slice };
      return cached.slice;
    }
    cache.current = { snapshot, slice };
    return slice;
    // A new selector function each render is expected; the snapshot identity
    // is the cache key, so the latest selector is applied to new snapshots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, selector, isEqual]);
  return useSyncExternalStore(store.subscribe, select, select);
}

/** Subscribe to a whole store snapshot. */
export function useStoreSnapshot<Snapshot>(store: ReadableStore<Snapshot>): Snapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/**
 * Register a channel-method provider with a session for as long as the
 * component is mounted. A layout effect, so registration precedes any passive
 * effect that starts the session's join.
 */
export function useChatMethodProvider(
  session: { registerMethods(key: string, provider: ChatMethodProvider): () => void },
  key: string,
  provider: ChatMethodProvider | undefined
): void {
  useLayoutEffect(() => (provider ? session.registerMethods(key, provider) : undefined), [
    session,
    key,
    provider,
  ]);
}

/** A store whose live resources are owned by a reference count. */
export interface RetainableStore {
  retain(): () => void;
}

/**
 * Create a store for the given identity and hold it while mounted.
 *
 * `create` must be side-effect free (React may call it and discard the result);
 * the store starts its live work on the first `retain()`.
 */
export function useRetainedStore<Store extends RetainableStore>(
  create: () => Store,
  identity: readonly unknown[]
): Store {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const store = useMemo(create, identity);
  useEffect(() => store.retain(), [store]);
  return store;
}
