import { dispatchRpcCall } from "@vibestudio/rpc/internal";
import type { RpcClient, RpcEventContext } from "@vibestudio/rpc";
import type { PanelLifecycleResult } from "@vibestudio/shared/types";
import { normalizePanelTitle } from "@vibestudio/shared/panel/title";
import type { PanelTreePlacement } from "@vibestudio/shared/panel/treeIndex";
import {
  rethrowPanelOperationError,
  type PanelDiagnosticPacket,
  type PanelObservation,
  type PanelSnapshotObservation,
} from "@vibestudio/shared/panel/observation";
import type {
  CdpAutomation,
  PanelContract,
  PanelFocusOptions,
  PanelHandle,
  PanelHandleContractRole,
  PanelHandleFromContract,
  PanelNavigateOptions,
  PanelSetTitleOptions,
  PanelWaitOptions,
  Rpc,
  TypedCallProxy,
} from "../core/index.js";
import { invalidateCdpGeneration } from "../panel/cdpAutomation.js";
import { defineScopeRef } from "./scopeRef.js";

export interface PanelHandleMetadata {
  id: string;
  title?: string;
  source?: string;
  kind?: "workspace" | "browser";
  parentId?: string | null;
  contextId?: string | null;
  rpcTargetId?: string | null;
  effectiveVersion?: string | null;
  buildKey?: string | null;
  ref?: string | null;
}

export interface PanelHandleHostOps {
  call?(id: string, method: string, args: unknown[]): Promise<{ observation: PanelObservation; runtimeEntityId: string; result: unknown }>;
  refresh?(id: string): Promise<PanelHandleMetadata>;
  observe?(id: string): Promise<PanelObservation>;
  diagnose?(id: string): Promise<PanelDiagnosticPacket>;
  parent?(id: string, parentId: string | null): PanelHandle | null;
  navigate?(
    id: string,
    source: string,
    options?: PanelNavigateOptions,
  ): Promise<PanelObservation>;
  reload?(id: string, options?: PanelWaitOptions): Promise<PanelObservation>;
  archive?(id: string): Promise<PanelLifecycleResult>;
  unload?(id: string): Promise<PanelLifecycleResult>;
  setTitle?(
    id: string,
    title: string,
    options?: PanelSetTitleOptions,
  ): Promise<void>;
  movePanel?(
    id: string,
    newParentId: string | null,
    placement?: PanelTreePlacement,
  ): Promise<void>;
  takeOver?(id: string): Promise<void>;
  openDevTools?(
    id: string,
    mode?: "detach" | "right" | "bottom",
  ): Promise<void>;
  rebuild?(id: string, options?: PanelWaitOptions): Promise<PanelObservation>;
  focus?(id: string, options?: PanelFocusOptions): Promise<PanelObservation>;
  stateArgs?: {
    get<T = Record<string, unknown>>(id: string): Promise<T>;
    patch(
      id: string,
      patch: Record<string, unknown>,
    ): Promise<Record<string, unknown>>;
  };
  snapshot?(
    id: string,
    options?: PanelWaitOptions,
  ): Promise<PanelSnapshotObservation>;
  callAgent?(id: string, method: string, args: unknown[]): Promise<unknown>;
}

type PanelHandleRpc = Pick<RpcClient, "call" | "emit" | "on">;
type RpcTargetResolver = string | (() => string | Promise<string>);

export function createCallProxy(
  rpc: Pick<RpcClient, "call">,
  targetId: RpcTargetResolver,
): Record<string, (...args: unknown[]) => Promise<unknown>> {
  return createInvocationProxy(async (method, args) => {
    const resolvedTargetId =
      typeof targetId === "function" ? await targetId() : targetId;
    return dispatchRpcCall(rpc, resolvedTargetId, method, args);
  });
}

function createInvocationProxy<T extends Rpc.UncontractedMethods>(
  invoke: (method: string, args: unknown[]) => Promise<unknown>,
): TypedCallProxy<T> {
  const target = {} as TypedCallProxy<T>;
  return new Proxy(target, {
    get(_target, method: string | symbol) {
      if (method === Symbol.toPrimitive)
        return () => "[PanelHandle RPC call proxy]";
      if (method === Symbol.toStringTag) return "PanelHandleRpc";
      // A dynamic RPC method named "then" would make every handle.call proxy a
      // thenable, so Promise resolution and eval result serialization would
      // invoke a remote method merely by observing the value.
      if (method === "then") return undefined;
      if (typeof method !== "string") return Reflect.get(target, method);
      return (...args: unknown[]) => invoke(method, args);
    },
  });
}

export function createPanelHandle<
  E extends Rpc.RpcEventMap = Rpc.RpcEventMap,
  EmitE extends Rpc.RpcEventMap = Rpc.RpcEventMap,
>(options: {
  rpc: PanelHandleRpc;
  metadata: PanelHandleMetadata;
  cdp: CdpAutomation;
  ops?: PanelHandleHostOps;
}): PanelHandle<Rpc.UncontractedMethods, E, EmitE> {
  const { rpc, cdp, ops } = options;
  let metadata = normalizeMetadata(options.metadata);
  let rpcTargetResolvePromise: Promise<string> | null = null;
  let rpcEventTargetId: string | null =
    metadata.rpcTargetId ?? (!ops?.refresh ? metadata.id : null);
  const refreshMetadata = async (): Promise<Required<PanelHandleMetadata>> => {
    if (ops?.refresh) {
      metadata = normalizeMetadata({
        ...metadata,
        ...(await ops.refresh(metadata.id)),
      });
    }
    // Use the same non-null fallback as resolveRpcTargetId: a manual refresh of
    // a still-unloaded refreshable handle must not reset the event target to
    // null, which would silently kill any active .on() subscription's filter.
    rpcEventTargetId = metadata.rpcTargetId ?? metadata.id;
    rpcTargetResolvePromise = null;
    return metadata;
  };
  const resolveRpcTargetId = async (): Promise<string> => {
    if (metadata.rpcTargetId) return metadata.rpcTargetId;
    if (!ops?.refresh) return metadata.id;
    rpcTargetResolvePromise ??= refreshMetadata().then((fresh) => {
      const targetId = fresh.rpcTargetId ?? fresh.id;
      rpcEventTargetId = targetId;
      return targetId;
    });
    return rpcTargetResolvePromise;
  };
  const rememberObservation = (
    observation: PanelObservation,
  ): PanelObservation => {
    metadata = normalizeMetadata({
      ...metadata,
      id: observation.panelId,
      title: observation.title,
      source: observation.source,
      kind: observation.kind,
      parentId: observation.parentId,
      contextId: observation.contextId,
      rpcTargetId: observation.runtimeEntityId,
      effectiveVersion: observation.effectiveVersion,
      buildKey: observation.buildKey,
      ref: observation.requestedRef,
    });
    rpcEventTargetId = metadata.rpcTargetId ?? metadata.id;
    rpcTargetResolvePromise = null;
    return observation;
  };
  const call = ops?.call
    ? createInvocationProxy<Rpc.UncontractedMethods>(async (method, args) => {
        const invocation = await ops.call!(metadata.id, method, args);
        rememberObservation(invocation.observation);
        return invocation.result;
      })
    : createCallProxy(rpc, resolveRpcTargetId);
  const lifecycle = async (operation: () => Promise<PanelObservation>) => {
    try {
      return rememberObservation(await operation());
    } catch (error) {
      rethrowPanelOperationError(error);
    }
  };

  const handle: PanelHandle<Rpc.UncontractedMethods, E, EmitE> = {
    get id() {
      return metadata.id;
    },
    get title() {
      return metadata.title;
    },
    get source() {
      return metadata.source;
    },
    get kind() {
      return metadata.kind;
    },
    get parentId() {
      return metadata.parentId;
    },
    observe: async () => {
      if (!ops?.observe)
        throw new Error("observe is not available for this handle");
      return lifecycle(() => ops.observe!(metadata.id));
    },
    call,
    cdp,
    click: (selector: string) => cdp.click(selector),
    diagnose: async () => {
      if (!ops?.diagnose)
        throw new Error("diagnose is not available for this handle");
      try {
        const packet = await ops.diagnose(metadata.id);
        rememberObservation(packet.observation);
        return packet;
      } catch (error) {
        rethrowPanelOperationError(error);
      }
    },
    stateArgs: {
      get: async <TState = Record<string, unknown>>() => {
        if (!ops?.stateArgs?.get) return {} as TState;
        return ops.stateArgs.get<TState>(metadata.id);
      },
      patch: async <TState = Record<string, unknown>>(
        patch: Record<string, unknown>,
      ) => {
        if (!ops?.stateArgs?.patch) {
          throw new Error("stateArgs.patch is not available for this handle");
        }
        return ops.stateArgs.patch(metadata.id, patch) as Promise<TState>;
      },
    },
    async emit(event: string, payload: unknown) {
      await rpc.emit(await resolveRpcTargetId(), event, payload);
    },
    on(
      event: string,
      listener: (payload: unknown) => void,
      website: import("@vibestudio/rpc").WebsiteMethodPolicy,
    ): () => void {
      if (!rpcEventTargetId) {
        void resolveRpcTargetId().catch(() => undefined);
      }
      return rpc.on(
        event,
        (ev: RpcEventContext) => {
          const targetId = rpcEventTargetId;
          if (targetId && ev.caller.callerId === targetId) listener(ev.payload);
        },
        website,
      );
    },
    withContract<C extends PanelContract, Role extends PanelHandleContractRole>(
      contract: C,
      role: Role,
    ): PanelHandleFromContract<C, Role> {
      const methods = contract[role]?.methods;
      const contractedCall = new Proxy({}, {
        get(_target, key) {
          if (key === "then" || typeof key !== "string") return undefined;
          const method = methods?.[key];
          if (!method) throw new Error(`Panel contract ${contract.source} has no ${role} method ${key}`);
          return (...args: unknown[]) => method.invoke(args, parsed => call[method.name]!(...parsed));
        },
      });
      return new Proxy(handle, { get(target, key, receiver) {
        return key === "call" ? contractedCall : Reflect.get(target, key, receiver);
      } }) as unknown as PanelHandleFromContract<C, Role>;
    },
    parent: () => ops?.parent?.(metadata.id, metadata.parentId) ?? null,
    navigate: async (source: string, options?: PanelNavigateOptions) => {
      if (!ops?.navigate)
        throw new Error("navigate is not available for this handle");
      invalidateCdpGeneration(cdp);
      return lifecycle(() => ops.navigate!(metadata.id, source, options));
    },
    reload: async (waitOptions?: PanelWaitOptions) => {
      if (!ops?.reload)
        throw new Error("reload is not available for this handle");
      invalidateCdpGeneration(cdp);
      return lifecycle(() => ops.reload!(metadata.id, waitOptions));
    },
    archive: async () => {
      if (!ops?.archive)
        throw new Error("archive is not available for this handle");
      invalidateCdpGeneration(cdp);
      return ops.archive(metadata.id);
    },
    // `await using` owns the panel for the enclosing block: disposal is
    // archive, and its failure propagates out of the block.
    [Symbol.asyncDispose]: async () => {
      await handle.archive();
    },
    unload: async () => {
      if (!ops?.unload)
        throw new Error("unload is not available for this handle");
      invalidateCdpGeneration(cdp);
      return ops.unload(metadata.id);
    },
    setTitle: async (title: string, titleOptions?: PanelSetTitleOptions) => {
      if (!ops?.setTitle)
        throw new Error("setTitle is not available for this handle");
      await ops.setTitle(metadata.id, title, titleOptions);
      metadata = normalizeMetadata({
        ...metadata,
        title: normalizePanelTitle(title) ?? metadata.source ?? metadata.id,
      });
    },
    movePanel: async (
      newParentId: string | null,
      placement?: PanelTreePlacement,
    ) => {
      if (!ops?.movePanel)
        throw new Error("movePanel is not available for this handle");
      await ops.movePanel(metadata.id, newParentId, placement);
    },
    takeOver: async () => {
      if (!ops?.takeOver)
        throw new Error("takeOver is not available for this handle");
      await ops.takeOver(metadata.id);
    },
    openDevTools: async (mode?: "detach" | "right" | "bottom") => {
      if (!ops?.openDevTools)
        throw new Error("openDevTools is not available for this handle");
      await ops.openDevTools(metadata.id, mode);
    },
    rebuild: async (waitOptions?: PanelWaitOptions) => {
      if (!ops?.rebuild)
        throw new Error("rebuild is not available for this handle");
      invalidateCdpGeneration(cdp);
      return lifecycle(() => ops.rebuild!(metadata.id, waitOptions));
    },
    focus: (focusOptions?: PanelFocusOptions) => {
      if (!ops?.focus)
        throw new Error("focus is not available for this handle");
      return lifecycle(() => ops.focus!(metadata.id, focusOptions));
    },
    snapshot: async (waitOptions?: PanelWaitOptions) => {
      if (!ops?.snapshot)
        throw new Error("snapshot is not available for this handle");
      try {
        return await ops.snapshot(metadata.id, waitOptions);
      } catch (error) {
        rethrowPanelOperationError(error);
      }
    },
    tree: () =>
      ops?.callAgent?.(metadata.id, "_agent.tree", []) ??
      Promise.resolve(undefined),
    state: () =>
      ops?.callAgent?.(metadata.id, "_agent.state", []) ??
      Promise.resolve(undefined),
    routes: () =>
      ops?.callAgent?.(metadata.id, "_agent.routes", []) ??
      Promise.resolve(undefined),
    setMode: (mode: "fixture" | "live") =>
      ops?.callAgent?.(metadata.id, "_agent.setMode", [mode]) ??
      Promise.resolve(undefined),
  } as PanelHandle<Rpc.UncontractedMethods, E, EmitE>;

  defineScopeRef(handle, () => ({ kind: "panel", id: metadata.id }));
  return handle;
}

export function unavailableCdp(id: string): CdpAutomation {
  const unavailable = () =>
    Promise.reject(new Error(`CDP is not available for panel ${id}`));
  return {
    session: unavailable,
    consoleHistory: unavailable,
    getCdpEndpoint: unavailable,
    stop: unavailable,
    click: unavailable,
    screenshot: unavailable,
  };
}

export interface ParentHandleApi {
  getParent<
      E extends Rpc.RpcEventMap = Rpc.RpcEventMap,
    EmitE extends Rpc.RpcEventMap = Rpc.RpcEventMap,
  >(): PanelHandle<Rpc.UncontractedMethods, E, EmitE> | null;
  getParentWithContract<C extends PanelContract>(
    contract: C,
  ): PanelHandleFromContract<C, "parent"> | null;
}

/**
 * Resolve a parent PanelHandle from launch metadata, portable across every
 * target (panel/worker/eval). A `panel` parent resolves to a real panel handle
 * via `getPanelHandle`; a `worker`/`do` parent resolves to a non-panel handle
 * (RPC-callable, not panel-navigable); no parent → null. Generalized from the
 * worker's former `createWorkerParentPanelHandle` so eval can reuse it.
 */
export function createRuntimeParentHandle(
  getPanelHandle: (id: string) => PanelHandle,
  parentId: string | null,
  parentEntityId: string | null,
  parentKind: "panel" | "worker" | "do" | null,
): PanelHandle | null {
  if (!parentId) return null;
  if (parentKind === "panel") return getPanelHandle(parentId);
  if (parentKind === "worker" || parentKind === "do") {
    return createNonPanelRuntimeHandle({
      id: parentEntityId ?? parentId,
      kind: parentKind,
    });
  }
  if (parentId.startsWith("worker:") || parentId.startsWith("do:")) {
    return createNonPanelRuntimeHandle({ id: parentId });
  }
  return getPanelHandle(parentId);
}

export function createParentHandleApi(
  resolveParent: () => PanelHandle | null,
): ParentHandleApi {
  const getParent = <
      E extends Rpc.RpcEventMap = Rpc.RpcEventMap,
    EmitE extends Rpc.RpcEventMap = Rpc.RpcEventMap,
  >(): PanelHandle<Rpc.UncontractedMethods, E, EmitE> | null => {
    return resolveParent() as PanelHandle<Rpc.UncontractedMethods, E, EmitE> | null;
  };
  const getParentWithContract = <C extends PanelContract>(
    contract: C,
  ): PanelHandleFromContract<C, "parent"> | null => {
    return getParent()?.withContract(contract, "parent") ?? null;
  };
  return { getParent, getParentWithContract };
}

export function createNonPanelRuntimeHandle(options: {
  id: string;
  /** Runtime entity kind; derived from a `worker:`/`do:` id prefix when omitted. */
  kind?: "worker" | "do";
  title?: string;
  source?: string;
  parentId?: string | null;
  parent?: () => PanelHandle | null;
}): PanelHandle {
  const unavailable = () =>
    Promise.reject(new Error(`${options.id} is not a panel target`));
  const handle: PanelHandle = {
    id: options.id,
    title: normalizePanelTitle(options.title) ?? options.id,
    source: options.source ?? options.id,
    kind: "workspace",
    parentId: options.parentId ?? null,
    observe: unavailable,
    call: new Proxy({} as PanelHandle["call"], {
      get: () => unavailable,
    }),
    cdp: unavailableCdp(options.id),
    click: unavailable,
    diagnose: unavailable,
    stateArgs: {
      get: <TState = Record<string, unknown>>() =>
        Promise.resolve({} as TState),
      patch: unavailable,
    },
    emit: unavailable,
    on: () => () => {},
    withContract: () => handle as never,
    parent: () => options.parent?.() ?? null,
    navigate: unavailable,
    reload: unavailable,
    archive: unavailable,
    [Symbol.asyncDispose]: unavailable,
    unload: unavailable,
    setTitle: unavailable,
    movePanel: unavailable,
    takeOver: unavailable,
    openDevTools: unavailable,
    rebuild: unavailable,
    focus: unavailable,
    snapshot: unavailable,
    tree: () => Promise.resolve(undefined),
    state: () => Promise.resolve(undefined),
    routes: () => Promise.resolve(undefined),
    setMode: () => Promise.resolve(undefined),
  };
  const entityKind =
    options.kind ??
    (options.id.startsWith("worker:")
      ? "worker"
      : options.id.startsWith("do:")
        ? "do"
        : null);
  // An entity of unknown kind has no reacquirable identity; it stays volatile.
  if (entityKind) {
    defineScopeRef(handle, () => ({ kind: entityKind, id: options.id }));
  }
  return handle;
}

function normalizeMetadata(
  metadata: PanelHandleMetadata,
): Required<PanelHandleMetadata> {
  const kind =
    metadata.kind ??
    (metadata.source?.startsWith("browser:") ? "browser" : "workspace");
  const source = stripBrowserPrefix(metadata.source ?? metadata.id);
  return {
    id: metadata.id,
    title: normalizePanelTitle(metadata.title) ?? metadata.id,
    source,
    kind,
    parentId: metadata.parentId ?? null,
    contextId: metadata.contextId ?? null,
    rpcTargetId: metadata.rpcTargetId ?? null,
    effectiveVersion: metadata.effectiveVersion ?? null,
    buildKey: metadata.buildKey ?? null,
    ref: metadata.ref ?? null,
  };
}

function stripBrowserPrefix(source: string): string {
  return source.startsWith("browser:")
    ? source.slice("browser:".length)
    : source;
}
