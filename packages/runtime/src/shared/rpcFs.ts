import { fsMethods } from "@vibestudio/service-schemas/fs";
import { createRpcMethodCaller, createRpcMethods, type RpcMethodArgs, type RpcMethodResult } from "@vibestudio/shared/rpcMethods";
/**
 * RPC-backed RuntimeFs implementation.
 *
 * Each method uses the canonical filesystem receiver contract.
 * Binary data travels as native Uint8Array values through the RPC wire codec.
 *
 * Shared between panels and workers — no Node.js or browser-specific dependencies.
 */
import type { RpcClient } from "@vibestudio/rpc";
import type {
  RuntimeFs,
  FileStats,
  Dirent,
  FileHandle,
  RuntimeBinaryData,
} from "../types.js";
import { toFileStats } from "./fs-utils.js";
// ---------------------------------------------------------------------------
// Binary helpers
// ---------------------------------------------------------------------------
function toUint8Array(data: RuntimeBinaryData): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new TypeError(
    "Binary filesystem payload must be an ArrayBuffer or ArrayBuffer view"
  );
}
function encodeWritePayload(data: string | RuntimeBinaryData): string | Uint8Array {
  if (typeof data === "string") return data;
  return toUint8Array(data);
}
// ---------------------------------------------------------------------------
// Dirent reconstruction
// ---------------------------------------------------------------------------
interface SerializedDirent {
  name: string;
  _isFile: boolean;
  _isDirectory: boolean;
  _isSymbolicLink: boolean;
}
function toDirent(d: SerializedDirent): Dirent {
  return {
    name: d.name,
    isFile: () => d._isFile,
    isDirectory: () => d._isDirectory,
    isSymbolicLink: () => d._isSymbolicLink,
  };
}
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
/**
 * `fs.constants` shared between all `createRpcFs` instances. Defined at module
 * scope (rather than per-instance) because these values are true constants and
 * the `readonly` tuple literal lets TypeScript narrow them precisely.
 */
const FS_CONSTANTS = {
  F_OK: 0,
  R_OK: 4,
  W_OK: 2,
  X_OK: 1,
} as const;

export interface RpcFsTelemetry {
  method: string;
  phase: "settled";
  elapsedMs: number;
  outcome: "ok" | "error";
}

export interface RpcFsOptions {
  /** Abort when the owning execution is explicitly cancelled; never a deadline. */
  signal?: AbortSignal;
  /** Optional observer for settled-operation latency and outcomes. */
  onTelemetry?: (event: RpcFsTelemetry) => void;
}

export function createRpcFs(rpc: Pick<RpcClient, "call">, options: RpcFsOptions = {}): RuntimeFs {
  const methods = createRpcMethods("fs", fsMethods);
  const invoke = createRpcMethodCaller(rpc, "main", methods);
  function call<K extends keyof typeof methods & string>(method: K, ...args: RpcMethodArgs<(typeof methods)[K]>): Promise<RpcMethodResult<(typeof methods)[K]>> {
    const startedAt = Date.now();
    const report = (event: RpcFsTelemetry): void => {
      try {
        options.onTelemetry?.(event);
      } catch (error) {
        console.warn("[rpc-fs] telemetry observer failed", error);
      }
    };
    const invocation = options.signal
      ? invoke(method, args, { signal: options.signal })
      : invoke(method, args);
    return invocation.then(
      (value) => {
        if (options.onTelemetry) {
          report({
            method,
            phase: "settled",
            elapsedMs: Date.now() - startedAt,
            outcome: "ok",
          });
        }
        return value;
      },
      (error: unknown) => {
        if (options.onTelemetry) {
          report({
            method,
            phase: "settled",
            elapsedMs: Date.now() - startedAt,
            outcome: "error",
          });
        }
        throw error;
      }
    );
  }
  return {
    constants: FS_CONSTANTS,
    async mktemp(prefix?: string): Promise<string> {
      return call("mktemp", prefix);
    },
    async mkdtemp(prefix?: string): Promise<string> {
      const path = await call("mktemp", prefix);
      await call("mkdir", path, { recursive: true });
      return path;
    },
    async readFile(path: string, encoding?: string): Promise<string | Uint8Array> {
      return call("readFile", path, encoding);
    },
    async writeFile(path: string, data: string | RuntimeBinaryData): Promise<void> {
      await call("writeFile", path, encodeWritePayload(data));
    },
    readdir: (async (
      path: string,
      options?: {
        withFileTypes?: boolean;
        recursive?: boolean;
      }
    ): Promise<string[] | Dirent[]> => {
      if (options?.withFileTypes) {
        const entries = await call("readdir", path, options);
        return entries.map((entry) => {
          if (typeof entry === "string") throw new TypeError("Filesystem receiver returned names when directory entries were requested");
          return toDirent(entry);
        });
      }
      const entries = await (options ? call("readdir", path, options) : call("readdir", path));
      return entries.map((entry) => {
        if (typeof entry !== "string") throw new TypeError("Filesystem receiver returned directory entries when names were requested");
        return entry;
      });
    }) as RuntimeFs["readdir"],
    async stat(path: string): Promise<FileStats> {
      return toFileStats(await call("stat", path));
    },
    async lstat(path: string): Promise<FileStats> {
      return toFileStats(await call("lstat", path));
    },
    async mkdir(
      path: string,
      options?: {
        recursive?: boolean;
      }
    ): Promise<string | undefined> {
      await call("mkdir", path, options);
      return undefined;
    },
    async rmdir(path: string): Promise<void> {
      await call("rmdir", path);
    },
    async rm(
      path: string,
      options?: {
        recursive?: boolean;
        force?: boolean;
      }
    ): Promise<void> {
      await call("rm", path, options);
    },
    async exists(path: string): Promise<boolean> {
      return call("exists", path);
    },
    async unlink(path: string): Promise<void> {
      await call("unlink", path);
    },
    async access(path: string, mode?: number): Promise<void> {
      await call("access", path, mode);
    },
    async appendFile(path: string, data: string | RuntimeBinaryData): Promise<void> {
      await call("appendFile", path, encodeWritePayload(data));
    },
    async copyFile(src: string, dest: string): Promise<void> {
      await call("copyFile", src, dest);
    },
    async rename(oldPath: string, newPath: string): Promise<void> {
      await call("rename", oldPath, newPath);
    },
    async realpath(path: string): Promise<string> {
      return call("realpath", path);
    },
    async open(filePath: string, flags?: string, mode?: number): Promise<FileHandle> {
      const { handleId } = await call("open", filePath, flags, mode);
      return {
        fd: handleId,
        async read(
          buffer: Uint8Array,
          offset: number,
          length: number,
          position: number | null
        ): Promise<{
          bytesRead: number;
          buffer: Uint8Array;
        }> {
          const result = await call("handleRead", handleId, length, position);
          buffer.set(result.buffer, offset);
          return { bytesRead: result.bytesRead, buffer };
        },
        async write(
          buffer: RuntimeBinaryData | string,
          offset?: number,
          length?: number,
          position?: number | null
        ): Promise<{
          bytesWritten: number;
          buffer: RuntimeBinaryData | string;
        }> {
          // Node parity: `write(string[, position[, encoding]])` as well as
          // `write(buffer[, offset[, length[, position]]])`. A string is encoded (utf-8)
          // and the 2nd arg is the file POSITION, not a byte offset.
          let slice: Uint8Array;
          let pos: number | null;
          if (typeof buffer === "string") {
            slice = new TextEncoder().encode(buffer);
            pos = typeof offset === "number" ? offset : null;
          } else {
            const bytes = toUint8Array(buffer);
            slice = bytes.subarray(offset ?? 0, (offset ?? 0) + (length ?? bytes.length));
            pos = position ?? null;
          }
          const result = await call("handleWrite", handleId, slice, pos);
          return { bytesWritten: result.bytesWritten, buffer };
        },
        async close(): Promise<void> {
          await call("handleClose", handleId);
        },
        async stat(): Promise<FileStats> {
          return toFileStats(await call("handleStat", handleId));
        },
      };
    },
    async readlink(path: string): Promise<string> {
      return call("readlink", path);
    },
    async symlink(target: string, path: string, type?: "file" | "dir" | "junction"): Promise<void> {
      await call("symlink", target, path, type);
    },
    async chmod(path: string, mode: number): Promise<void> {
      await call("chmod", path, mode);
    },
    async utimes(path: string, atime: Date | number, mtime: Date | number): Promise<void> {
      // Convert Date to seconds-since-epoch for JSON transport
      const a = atime instanceof Date ? atime.getTime() / 1000 : atime;
      const m = mtime instanceof Date ? mtime.getTime() / 1000 : mtime;
      await call("utimes", path, a, m);
    },
    async truncate(path: string, len?: number): Promise<void> {
      await call("truncate", path, len);
    },
  };
}
