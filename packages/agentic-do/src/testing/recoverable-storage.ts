import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import type { Storage, StorageWrite } from "@panticonic/pi-durable";
import { openNodeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";

/** Real connection closure and durable rollback; faults never make a failed Session reusable. */
export async function recoverableStorage(
  reject: (writes: readonly StorageWrite[]) => unknown | undefined,
) {
  const directory = await mkdtemp(join(tmpdir(), "native-storage-recovery-"));
  const path = join(directory, "session.sqlite");
  const connections = new Set<Storage>();
  async function reopen(): Promise<Storage> {
    const backend = await openNodeSqliteStorage(path);
    connections.add(backend);
    return new Proxy(backend, {
      get(target, key) {
        if (key === "commit") return async (...args: Parameters<Storage["commit"]>) => {
          const error = reject(args[0]);
          if (error !== undefined) throw error;
          return target.commit(...args);
        };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }
  try {
    const storage = await reopen();
    return {
      storage,
      reopen,
      async cleanup() {
        const results = await Promise.allSettled([...connections].map((connection) => connection.close(BACKGROUND_CONTEXT)));
        await rm(directory, { recursive: true, force: true });
        for (const result of results) if (result.status === "rejected") throw result.reason;
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
