import {
  KeyValueScopePersistence,
  clientUiScopeChannelId,
  type ScopeBlobBackend,
  type ScopeKeyValueStore,
} from "@workspace/eval";

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The panel's localStorage partition, read at each call (it may be unavailable). */
const localStorageStore: ScopeKeyValueStore = {
  get: (key) => getStorage()?.getItem(key) ?? null,
  set: (key, value) => getStorage()?.setItem(key, value),
  *keys() {
    const storage = getStorage();
    if (!storage) return;
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key) yield key;
    }
  },
};

/**
 * Browser-local scope row storage. Rows live in the panel's localStorage partition; large spilled
 * values go through the shared workspace blobstore.
 */
export class LocalStorageScopePersistence extends KeyValueScopePersistence {
  constructor(blobs: ScopeBlobBackend) {
    super(localStorageStore, blobs);
  }
}

export const panelLocalScopeChannelId = clientUiScopeChannelId;
