/**
 * Scope rows kept in a client's key-value store: the browser panel's
 * localStorage, the terminal chat's durable session state. Large values spill
 * through the blob backend as everywhere (\`ScopePersistenceAdapter\`).
 */
import {
  ScopePersistenceAdapter,
  type ScopeBlobBackend,
  type ScopeRowBackend,
} from "./scopePersistenceAdapter.js";
import type { ScopeEntry, ScopeListEntry } from "./scopePersistence.js";

/** A string key-value store; a client without one returns null and no keys. */
export interface ScopeKeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void | Promise<void>;
  keys(): Iterable<string>;
}

const ENTRY_PREFIX = "vibestudio:agentic-chat:scope:v1:entry:";

function entryKey(id: string): string {
  return `${ENTRY_PREFIX}${id}`;
}

function parseEntry(raw: string | null): ScopeEntry | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (
      typeof record["id"] !== "string" ||
      typeof record["channelId"] !== "string" ||
      typeof record["panelId"] !== "string" ||
      typeof record["data"] !== "string" ||
      typeof record["createdAt"] !== "number" ||
      !Array.isArray(record["serializedKeys"]) ||
      !Array.isArray(record["droppedPaths"]) ||
      !Array.isArray(record["volatileKeys"])
    ) {
      return null;
    }
    const entry: ScopeEntry = {
      id: record["id"],
      channelId: record["channelId"],
      panelId: record["panelId"],
      data: record["data"],
      serializedKeys: record["serializedKeys"].filter(
        (item): item is string => typeof item === "string"
      ),
      droppedPaths: record["droppedPaths"].filter(
        (item): item is { path: string; reason: string } =>
          !!item &&
          typeof item === "object" &&
          typeof (item as Record<string, unknown>)["path"] === "string" &&
          typeof (item as Record<string, unknown>)["reason"] === "string"
      ),
      volatileKeys: record["volatileKeys"].filter(
        (item): item is string => typeof item === "string"
      ),
      createdAt: record["createdAt"],
    };
    if (Array.isArray(record["blobRefs"])) {
      entry.blobRefs = record["blobRefs"].filter(
        (item): item is string => typeof item === "string"
      );
    }
    return entry;
  } catch {
    return null;
  }
}

class KeyValueScopeRowBackend implements ScopeRowBackend {
  constructor(private readonly store: ScopeKeyValueStore) {}

  async upsert(entry: ScopeEntry): Promise<void> {
    await this.store.set(entryKey(entry.id), JSON.stringify(entry));
  }

  async loadCurrent(channelId: string, panelId: string): Promise<ScopeEntry | null> {
    const entries = this.entries().filter(
      (entry) => entry.channelId === channelId && entry.panelId === panelId
    );
    entries.sort((a, b) => b.createdAt - a.createdAt);
    return entries[0] ?? null;
  }

  async get(id: string): Promise<ScopeEntry | null> {
    return parseEntry(this.store.get(entryKey(id)));
  }

  async list(channelId: string): Promise<ScopeListEntry[]> {
    return this.entries()
      .filter((entry) => entry.channelId === channelId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((entry) => ({
        id: entry.id,
        createdAt: entry.createdAt,
        keys: [...entry.serializedKeys],
        volatile: [...entry.volatileKeys],
      }));
  }

  private entries(): ScopeEntry[] {
    const entries: ScopeEntry[] = [];
    for (const key of this.store.keys()) {
      if (!key.startsWith(ENTRY_PREFIX)) continue;
      const entry = parseEntry(this.store.get(key));
      if (entry) entries.push(entry);
    }
    return entries;
  }
}

export class KeyValueScopePersistence extends ScopePersistenceAdapter {
  constructor(store: ScopeKeyValueStore, blobs: ScopeBlobBackend) {
    super(new KeyValueScopeRowBackend(store), blobs);
  }
}

/** The scope channel of one chat client's rendered UI in one conversation. */
export function clientUiScopeChannelId(channelId: string, clientId: string): string {
  return JSON.stringify(["panel-ui", channelId, clientId]);
}
