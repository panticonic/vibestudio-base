import { createRpcMethods, createRpcMethodCaller, type RpcMethodArgs, type RpcMethodResult } from "@vibestudio/shared/rpcMethods";
import { mainRpcMethod } from "@vibestudio/service-schemas/mainRpc";
import { workspaceStateMethods } from "@vibestudio/service-schemas/workspaceState";
import {
  createWorkspaceStateClient,
  type ShellServiceCall,
} from "@vibestudio/service-schemas/clients/workspaceStateClient";

export interface RuntimeWorkspaceStateRpc {
  call: import("@vibestudio/rpc").RpcCaller["call"];
}

/**
 * The portable runtime's single workspace-state boundary. Workspace semantics
 * are implemented by WorkspaceDO; the named service supplies authority,
 * invalidation, and post-commit presentation convergence for every caller.
 */
const workspaceStateRpcMethods = createRpcMethods("workspace-state", workspaceStateMethods);
export function callWorkspaceState<K extends keyof typeof workspaceStateRpcMethods & string>(
  rpc: RuntimeWorkspaceStateRpc,
  method: K,
  args: RpcMethodArgs<(typeof workspaceStateRpcMethods)[K]>,
): Promise<RpcMethodResult<(typeof workspaceStateRpcMethods)[K]>> {
  return createRpcMethodCaller(rpc, "main", workspaceStateRpcMethods)(method, args);
}

export function createRuntimeWorkspaceStateClient(rpc: RuntimeWorkspaceStateRpc) {
  const callService: ShellServiceCall = (_service, method, args) =>
    rpc.call("main", mainRpcMethod(`workspace-state.${method}`), args);
  return createWorkspaceStateClient(callService);
}
