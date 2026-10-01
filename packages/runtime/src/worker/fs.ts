/**
 * Filesystem provider backed by worker RPC.
 *
 * Workers can expose this through the module-map fs shim before a specific
 * worker instance has called createWorkerRuntime(), but I/O requires that
 * explicit initialization. Waiting during module evaluation would deadlock
 * the fetch entry that performs initialization. Durable Objects use this.fs.
 */

import type { RuntimeFs } from "../types.js";
import type { RpcClient } from "@vibestudio/rpc";
import { createRpcFs } from "../shared/rpcFs.js";

let _fs: RuntimeFs | null = null;

export function _initFsWithRpc(rpc: Pick<RpcClient, "call">): RuntimeFs {
  _fs = createRpcFs(rpc);
  return _fs;
}

const FS_CONSTANTS = {
  F_OK: 0,
  R_OK: 4,
  W_OK: 2,
  X_OK: 1,
} as const;

export const fs: RuntimeFs = new Proxy({} as RuntimeFs, {
  get(_target, prop: string | symbol) {
    if (prop === "then" || typeof prop === "symbol") return undefined;
    if (prop === "constants") return FS_CONSTANTS;
    return async (...args: unknown[]) => {
      if (!_fs)
        throw new Error(
          "[Vibestudio] Worker filesystem requires createWorkerRuntime(env) before I/O; Durable Objects use this.fs",
        );
      const method = (_fs as any)[prop] as (
        ...args: unknown[]
      ) => Promise<unknown>;
      return method.apply(_fs, args);
    };
  },
});
