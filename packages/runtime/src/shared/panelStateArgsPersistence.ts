import type { RpcClient } from "@vibestudio/rpc";
import { decodePanelStateArgs } from "@vibestudio/shared/panelStateArgs";
import { asPanelSlotId } from "@vibestudio/shared/panel/idValues";
import { callWorkspaceState, createRuntimeWorkspaceStateClient } from "./workspaceStateClient.js";

type PanelStateArgsRpc = Pick<RpcClient, "call">;



export async function readPanelStateArgs<T = Record<string, unknown>>(
  rpc: PanelStateArgsRpc,
  panelId: string
): Promise<T> {
  const detail = await callWorkspaceState(rpc, "panelTree.detail", [
    panelId,
  ]);
  if (!detail) throw new Error(`Panel not found: ${panelId}`);
  return decodePanelStateArgs(detail.currentHistory.state_args) as T;
}

/**
 * Apply an RFC 7386 JSON merge patch to a panel's stateArgs: objects merge
 * recursively, `null` deletes a key, and arrays and scalars replace. The
 * workspace-state owner serializes the merge and validates the result against
 * the panel's active build schema, so concurrent patches compose.
 */
export function patchPanelStateArgs(
  rpc: PanelStateArgsRpc,
  panelId: string,
  patch: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return createRuntimeWorkspaceStateClient(rpc).patchCurrentStateArgs(
    asPanelSlotId(panelId),
    patch
  );
}
