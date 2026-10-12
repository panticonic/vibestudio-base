/**
 * Framework-free observable state primitives for the chat stores.
 *
 * Every chat store follows one explicit pipeline per input:
 *
 *   event → reduce → derive → reactions → ONE notify
 *
 * A store mutates its private state inside `transaction()`. Nested updates
 * (a reaction that updates state again) join the outer transaction, so
 * subscribers observe exactly one coherent snapshot per input instead of the
 * intermediate states an effect cascade would expose.
 *
 * Snapshots are immutable and keep their identity until something changes,
 * which is what `useSyncExternalStore` (and any other subscriber) relies on.
 */

export type StoreListener = () => void;

/** The read side every chat store exposes. */
export interface ReadableStore<Snapshot> {
  getSnapshot(): Snapshot;
  subscribe(listener: StoreListener): () => void;
}

/** Shallow equality for snapshot slices (objects compared key by key). */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (
      !Object.prototype.hasOwnProperty.call(b, key) ||
      !Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
    )
      return false;
  }
  return true;
}

/**
 * Snapshot holder with batched notification.
 *
 * Subclasses (or owners) call `update()` to replace fields; `update()` keeps the
 * previous snapshot object when no field changed identity, so an unchanged
 * input never wakes a subscriber.
 */
export class StateCell<Snapshot extends object> implements ReadableStore<Snapshot> {
  #snapshot: Snapshot;
  #listeners = new Set<StoreListener>();
  #depth = 0;
  #changed = false;

  constructor(initial: Snapshot) {
    this.#snapshot = initial;
  }

  readonly getSnapshot = (): Snapshot => this.#snapshot;

  readonly subscribe = (listener: StoreListener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Merge a partial snapshot. Fields equal by identity are ignored. */
  update(patch: Partial<Snapshot> | ((current: Snapshot) => Partial<Snapshot>)): void {
    const current = this.#snapshot;
    const changes = typeof patch === "function" ? patch(current) : patch;
    let next: Snapshot | null = null;
    for (const key of Object.keys(changes) as Array<keyof Snapshot>) {
      if (Object.is(current[key], changes[key])) continue;
      next ??= { ...current };
      next[key] = changes[key] as Snapshot[keyof Snapshot];
    }
    if (!next) return;
    this.#snapshot = next;
    this.#changed = true;
    if (this.#depth === 0) this.#flush();
  }

  /**
   * Run `work` as one pipeline step. Updates made inside — including updates
   * made by reactions the step triggers synchronously — produce a single
   * notification when the outermost transaction ends.
   */
  transaction<T>(work: () => T): T {
    this.#depth += 1;
    try {
      return work();
    } finally {
      this.#depth -= 1;
      if (this.#depth === 0 && this.#changed) this.#flush();
    }
  }

  #flush(): void {
    this.#changed = false;
    for (const listener of [...this.#listeners]) {
      try {
        listener();
      } catch (error) {
        console.error("[chat-store] listener failed:", error);
      }
    }
  }
}

/**
 * Reference-counted ownership of a store's live resources.
 *
 * `retain()` starts the resource on the first holder and returns its release.
 * When the last holder releases, disposal is deferred to the end of the
 * current synchronous turn (a microtask): React StrictMode unmounts and
 * immediately remounts effects in the same turn, and that remount re-retains
 * the very same instance, so the connection is neither torn down nor doubled.
 * The deferral is a turn boundary, not a timer.
 */
export class RetainCount {
  #holders = 0;
  #started = false;
  #disposal: { cancelled: boolean } | null = null;
  #disposed = false;

  constructor(
    private readonly hooks: {
      start: () => void;
      dispose: () => void;
    }
  ) {}

  get disposed(): boolean {
    return this.#disposed;
  }

  retain(): () => void {
    if (this.#disposed) throw new Error("A disposed chat store cannot be retained again");
    this.#holders += 1;
    if (this.#disposal) {
      this.#disposal.cancelled = true;
      this.#disposal = null;
    }
    if (!this.#started) {
      this.#started = true;
      this.hooks.start();
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#holders -= 1;
      if (this.#holders > 0) return;
      const disposal = { cancelled: false };
      this.#disposal = disposal;
      queueMicrotask(() => {
        if (disposal.cancelled || this.#holders > 0) return;
        this.#disposal = null;
        this.disposeNow();
      });
    };
  }

  /** Dispose immediately, regardless of holders (explicit owner shutdown). */
  disposeNow(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.hooks.dispose();
  }
}

/** Error text for display; never a stack. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Normalize anything thrown into an Error, preserving Errors as-is. */
export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
