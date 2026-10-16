/**
 * The workspace runtime for code running inside a terminal app (the terminal
 * chat's cards): the portable `WorkspaceRuntime`, assembled like the worker's
 * from the app's own connection. The app is its principal, so every call has
 * exactly the app's authority. Panels it opens land in the person's panel
 * tree as roots; it has no parent panel of its own.
 */
import type { RpcClient } from "@vibestudio/rpc";
import type { OpenExternalOptions } from "@vibestudio/shared/externalOpen";
import * as portable from "../shared/portable.js";
import { createRpcFs } from "../shared/rpcFs.js";
import { createWorkerdClient } from "../shared/workerd.js";
import { createNonPanelRuntimeHandle } from "../shared/handles.js";
import { helpfulNamespace } from "../shared/helpfulNamespace.js";
import { createGatewayFetch } from "../shared/gatewayFetch.js";
import { createMainCaller } from "../shared/mainRpc.js";
import { createPanelRuntime } from "../shared/panelRuntime.js";
import {
  createHostedRuntime,
  type RuntimeHost,
  type WorkspaceRuntime,
} from "../shared/hostedRuntime.js";

export type { WorkspaceRuntime } from "../shared/hostedRuntime.js";

export function createTerminalRuntime(options: {
  rpc: RpcClient;
  contextId: string;
}): WorkspaceRuntime {
  const { rpc, contextId } = options;
  const id = rpc.selfId;
  const callMain = createMainCaller(rpc);
  const panelRuntime = createPanelRuntime({
    rpc,
    contextId,
    selfHandle: () => createNonPanelRuntimeHandle({ id, title: "Terminal" }),
    defaultOpenParentId: null,
    requesterPanelId: null,
  });
  const host: RuntimeHost = {
    id,
    contextId,
    rpc,
    fs: createRpcFs(rpc),
    gatewayConfig: null,
    gatewayFetch: createGatewayFetch({ rpc }),
    panelRuntime,
    workers: helpfulNamespace("workers", createWorkerdClient(rpc)),
    openExternal: (url: string, openOptions?: OpenExternalOptions) =>
      callMain("externalOpen.openExternal", url, openOptions),
    resolveParent: () => null,
  };
  return createHostedRuntime(host);
}

/**
 * `@workspace/runtime` as code in a terminal app imports it: the portable
 * helpers plus this runtime's members as named exports.
 */
export function terminalRuntimeModule(runtime: WorkspaceRuntime): Record<string, unknown> {
  return { ...portable, ...runtime };
}
