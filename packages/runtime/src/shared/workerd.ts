import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import { createDurableObjectServiceClient } from "@vibestudio/service-schemas/clients/durableObjectServiceClient";
export { createDurableObjectServiceClient, createGadServiceClient, resolveDurableObjectService } from "@vibestudio/service-schemas/clients/durableObjectServiceClient";
import type { workersMethods } from "@vibestudio/service-schemas/workers";
import { createLazyTypedRpcServiceClient } from "@vibestudio/shared/typedRpcServiceClient";
import type { RpcMethodMap } from "@vibestudio/shared/rpcMethods";
import type { TypedServiceClient } from "@vibestudio/shared/typedServiceClient";
/**
 * Typed client for the workerd RPC service.
 *
 * Worker instance lifecycle and workspace service resolution.
 * The ergonomic methods here delegate to the canonical runtime entity service,
 * so panels, workers, Durable Objects, and eval all use the same lifecycle.
 *
 * Raw file primitives (cloneDO/destroyDO) remain server-internal. The public
 * exact-target reset/backup/restore methods below are journaled, fenced recovery
 * operations with normal capability review.
 * Source discovery stays here as `workers.listSources()` so the rich runtime
 * binding does not force callers down to raw `rpc.call` for the obvious read.
 *
 * Available to server, panel, and worker callers.
 */
import type { RpcCaller } from "@vibestudio/rpc";
import type {
  RuntimeEntityCreateSpec,
  RuntimeEntityHandle,
} from "@vibestudio/shared/runtime/entitySpec";
import { type DurableObjectServiceClient, type ResolvedDurableObjectTarget } from "@vibestudio/shared/workspaceServiceRpc";

export { GAD_WORKSPACE_SERVICE_PROTOCOL, doTargetId, parseDoTargetId } from "@vibestudio/shared/workspaceServiceRpc";
export type {
  DORefParam,
  DurableObjectServiceClient,
  ResolvedDurableObjectTarget,
} from "@vibestudio/shared/workspaceServiceRpc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface WorkerSourceInfo {
  name: string;
  source: string;
  title?: string;
  icon?: string;
  /** Manifest entry point relative to `source`; do not guess `index.ts`. */
  entry?: string;
  /** Durable Object classes declared by this source; empty for a regular worker. */
  classes: Array<{ className: string; [key: string]: unknown }>;
  agent?: {
    displayName?: string;
    description?: string;
    defaultConfig?: unknown;
  };
}

export type WorkerCreateOptions = Omit<
  Extract<RuntimeEntityCreateSpec, { kind: "worker" }>,
  "kind" | "execution"
> & {
  ref?: string;
  artifact?: { buildKey: string; executionDigest: string };
};

export type WorkerEntityHandle = RuntimeEntityHandle & { kind: "worker" };

export type DurableObjectCreateOptions = Omit<
  Extract<RuntimeEntityCreateSpec, { kind: "do" }>,
  "kind" | "execution" | "className"
> & {
  ref?: string;
};

export type DurableObjectEntityHandle = RuntimeEntityHandle & { kind: "do" };

/** Any runtime entity reference accepted by the shared retirement path. */
export type RuntimeEntityReference = string | Pick<RuntimeEntityHandle, "id">;

export type DurableObjectStorageTarget = Pick<
  ResolvedDurableObjectTarget,
  "source" | "className" | "objectKey"
> & { targetId?: string };

export interface DurableObjectStorageBackup {
  operationId: string;
  intent: string;
  createdAt: number;
}

export interface WorkerEntityInfo {
  id: string;
  kind: "worker";
  source: string;
  /** Caller-selected instance key; match this or `id` against create(). */
  key: string;
  contextId: string;
  title?: string;
  createdAt: number;
}

export type WorkspaceServiceInfo = {
  origin: "product" | "workspace";
  name: string;
  title?: string;
  description?: string;
  protocols: string[];
  source: string;
  /** Live, caller-context documentation entry for workspace-owned services. */
  docsId?: string;
} & (
  | {
      kind: "durable-object";
      className: string;
      defaultObjectKey: string | null;
    }
  | {
      kind: "worker";
      routePath: string;
    }
);
import type { ResolvedWorkspaceService } from "@vibestudio/workspace-contracts/workspaceConfigSchema";
export type { ResolvedWorkspaceService } from "@vibestudio/workspace-contracts/workspaceConfigSchema";
// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface WorkerdClient {
  /** List every launchable worker source and its real manifest entry point. */
  listSources(): Promise<WorkerSourceInfo[]>;
  /**
   * Launch a regular worker in the caller's context through the canonical lifecycle.
   * options.key is an immutable instance identity, including its selected code
   * version and context. Use a fresh key for a replacement or after editing
   * disposable code. Dispose short-lived handles in finally; long-lived instances
   * need an explicit owner and retirement lifecycle.
   */
  create(source: string, options?: WorkerCreateOptions): Promise<WorkerEntityHandle>;
  /**
   * Create a Durable Object whose lifecycle belongs to this caller. Resolve an
   * existing/shared object with resolveDurableObject() instead; resolution does
   * not confer destruction authority.
   */
  createDurableObject(
    source: string,
    className: string,
    options?: DurableObjectCreateOptions
  ): Promise<DurableObjectEntityHandle>;
  /** List live regular-worker instances. */
  list(): Promise<WorkerEntityInfo[]>;
  /** Retire an entity created by this caller. */
  destroy(entity: RuntimeEntityReference): Promise<void>;
  /** Back up and reset one exact DO storage target. */
  resetStorage(
    target: DurableObjectStorageTarget,
    intent: string
  ): Promise<{ operationId: string }>;
  /** List recoverable backups for one exact DO storage target. */
  listStorageBackups(target: DurableObjectStorageTarget): Promise<DurableObjectStorageBackup[]>;
  /** Restore a verified backup to the same exact DO storage target. */
  restoreStorageBackup(
    target: DurableObjectStorageTarget,
    operationId: string,
    intent: string
  ): Promise<{ operationId: string }>;
  /** List product-owned and workspace-authored services available here. */
  listServices(): Promise<WorkspaceServiceInfo[]>;
  /** Resolve a workspace service by name or protocol. */
  resolveService(query: string, objectKey?: string | null): Promise<ResolvedWorkspaceService>;
  /** Resolve a concrete Durable Object target and grant this caller relay access. */
  resolveDurableObject(
    source: string,
    className: string,
    objectKey: string
  ): Promise<ResolvedDurableObjectTarget>;
  /** Resolve a Durable Object-backed service and call it through unified RPC. */
  durableObjectService<M extends RpcMethodMap>(query: string, methods: M, objectKey?: string | null): DurableObjectServiceClient<M>;
}
export function createWorkerdClient(rpc: RpcCaller): WorkerdClient {
  const workers: TypedServiceClient<typeof workersMethods> = createLazyTypedRpcServiceClient(
    rpc, { targetId: "main", namespace: "workers" }, ["listSources", "listServices", "resolveService", "resolveDurableObject", "resetStorage", "listStorageBackups", "restoreStorageBackup"],
    async () => (await import("@vibestudio/service-schemas/workers")).workersMethods,
  );

  return {
    listSources: () => workers.listSources(),
    create: async (source, options = {}) => {
      const { ref, artifact, ...entityOptions } = options;
      const handle = await rpc.call("main", mainRpcMethods["runtime.createEntity"], [
        {
          kind: "worker",
          execution: {
            surface: "code",
            source,
            ...(ref ? { ref } : {}),
            ...(artifact ? { artifact } : {}),
          },
          ...entityOptions,
        },
      ]);
      if (handle.kind !== "worker") throw new TypeError("Runtime receiver returned another entity kind for worker creation");
      return { ...handle, kind: handle.kind };
    },
    createDurableObject: async (source, className, options = {}) => {
      const { ref, ...entityOptions } = options;
      const handle = await rpc.call("main", mainRpcMethods["runtime.createEntity"], [
        {
          kind: "do",
          execution: { surface: "code", source, ...(ref ? { ref } : {}) },
          className,
          ...entityOptions,
        },
      ]);
      if (handle.kind !== "do") throw new TypeError("Runtime receiver returned another entity kind for durable object creation");
      return { ...handle, kind: handle.kind };
    },
    list: async () => (await rpc.call("main", mainRpcMethods["runtime.listEntities"], [{ kind: "worker" }])).map((entity) => {
      if (entity.kind !== "worker") throw new TypeError("Runtime receiver returned another entity kind in the worker list");
      return { ...entity, kind: entity.kind };
    }),
    destroy: (entity) =>
      rpc.call("main", mainRpcMethods["runtime.retireEntity"], [
        {
          id: typeof entity === "string" ? entity : entity.id,
        },
      ]),
    resetStorage: (target, intent) =>
      workers.resetStorage(target, intent),
    listStorageBackups: (target) =>
      workers.listStorageBackups(target),
    restoreStorageBackup: (target, operationId, intent) =>
      workers.restoreStorageBackup(target, operationId, intent),
    listServices: () => workers.listServices(),
    resolveService: (query, objectKey) =>
      workers.resolveService(query, objectKey ?? null),
    resolveDurableObject: (source, className, objectKey) =>
      workers.resolveDurableObject(
        source,
        className,
        objectKey
      ),
    durableObjectService: (query, methods, objectKey) =>
      createDurableObjectServiceClient(rpc, query, methods, objectKey),
  };
}
