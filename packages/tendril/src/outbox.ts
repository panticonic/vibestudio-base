/**
 * The page's outbound queue. Every item carries a client id (`cid`) that the
 * receiver deduplicates on (channel publish `idempotencyKey`, TendrilDO
 * `applyState`), so the queue resends blindly: in order, on demand, never on a
 * timer. Items survive a reload when a storage is given.
 */
import type { StateOp } from "./protocol.js";

export type OutboxItem =
  | { cid: string; kind: "publish"; type: string; payload: unknown }
  | { cid: string; kind: "state"; ops: StateOp[] };

export interface OutboxStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Outbox {
  readonly size: number;
  /** Enqueue and try to deliver; resolves true once delivered, false if it stays queued. */
  push(item: OutboxItem): Promise<boolean>;
  /** Deliver queued items in order; stops at the first failure. */
  flush(): Promise<void>;
  pending(): readonly OutboxItem[];
}

export function createOutbox(opts: {
  deliver(item: OutboxItem): Promise<void>;
  storage?: OutboxStorage | null;
  storageKey?: string;
  onError?(error: unknown, item: OutboxItem): void;
}): Outbox {
  const key = opts.storageKey ?? "tendril-outbox";
  let items: OutboxItem[] = [];
  try {
    const saved = opts.storage?.getItem(key);
    if (saved) items = JSON.parse(saved) as OutboxItem[];
  } catch {
    items = [];
  }
  const persist = () => {
    if (!opts.storage) return;
    try {
      if (items.length) opts.storage.setItem(key, JSON.stringify(items));
      else opts.storage.removeItem(key);
    } catch {
      // Storage full or unavailable: the queue still works in memory.
    }
  };
  let running: Promise<void> | null = null;
  const drain = async (): Promise<void> => {
    while (items.length) {
      const head = items[0]!;
      try {
        await opts.deliver(head);
      } catch (error) {
        opts.onError?.(error, head);
        return;
      }
      if (items[0] === head) items.shift();
      persist();
    }
  };
  const flush = (): Promise<void> => {
    running ??= drain().finally(() => {
      running = null;
    });
    return running;
  };
  return {
    get size() {
      return items.length;
    },
    async push(item) {
      items.push(item);
      persist();
      // A flush already in progress may have stopped before this item.
      if (running) await running;
      await flush();
      return !items.some((queued) => queued.cid === item.cid);
    },
    flush,
    pending: () => items,
  };
}
