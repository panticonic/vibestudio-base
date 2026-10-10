import type { RpcCaller } from "@vibestudio/rpc";
import type { IndexablePanel } from "@vibestudio/shared/panelSearchTypes";
import type { WorkspacePanelDetail, WorkspacePanelTreeRootGroupPage, WorkspacePanelTreeRootGroupPageInput, WorkspacePanelTreeSearchInput } from "@vibestudio/shared/panel/workspaceStateSnapshot";
import type {
  PanelTreePageInput,
  PanelTreePath,
} from "@vibestudio/shared/panel/treeIndex";
import { asPanelSlotId } from "@vibestudio/shared/panel/idValues";
import {
  callWorkspaceState,
  createRuntimeWorkspaceStateClient,
} from "./workspaceStateClient.js";

/**
 * Base's panel-presentation client.
 *
 * Workspace presentation remains implemented by Base's durable owner, while
 * the existing workspace-state service is the sole authority and composition
 * boundary for every shell, panel, and worker caller. Keeping this client as a
 * typed facade avoids teaching callers the owner's identity or asking each
 * caller to acquire a second capability for lifecycle bookkeeping.
 */
export function createWorkspacePresentationClient(
  rpc: Pick<RpcCaller, "call">,
) {
  const state = createRuntimeWorkspaceStateClient(rpc);
  const detail = async (
    slotId: string,
  ): Promise<
    | (WorkspacePanelDetail & {
        presentation: { title: string; icon?: string };
      })
    | null
  > => {
    const value = await state.getPanelDetail(asPanelSlotId(slotId));
    if (!value) return null;
    return {
      ...value,
      presentation: {
        title: value.slot.current_entity_title ?? slotId,
        ...(value.icon ? { icon: value.icon } : {}),
      },
    };
  };

  return {
    workspaceState: state,
    rootGroups: (input: WorkspacePanelTreeRootGroupPageInput) =>
      state.getPanelTreeRootGroups(
        input,
      ) as Promise<WorkspacePanelTreeRootGroupPage>,
    rootsForCaller: (input: { cursor?: string; limit?: number }) =>
      callWorkspaceState(
        rpc,
        "panelTree.rootsForCaller",
        [input],
      ),
    page: (input: PanelTreePageInput) => state.getPanelTreePage(input),
    path: (slotId: string): Promise<PanelTreePath | null> =>
      state.getPanelTreePath(asPanelSlotId(slotId)),
    detail,
    searchTree: (input: WorkspacePanelTreeSearchInput) =>
      callWorkspaceState(
        rpc,
        "panelTree.search",
        [input],
      ),
    indexPanel: (panel: IndexablePanel) =>
      callWorkspaceState(rpc, "panel.index", [panel]),
    updatePanelTitle: (
      slotId: string,
      title: string,
      options?: { explicit?: boolean },
    ) =>
      callWorkspaceState(rpc, "panel.updateTitle", [
        slotId,
        title,
        options,
      ]),
    incrementAccess: (slotId: string) =>
      callWorkspaceState(rpc, "panel.incrementAccess", [slotId]),
    sourceUsage: (limit = 200) =>
      callWorkspaceState(rpc, "panel.sourceUsage", [limit]),
    rebuildIndex: () => callWorkspaceState(rpc, "panel.rebuildIndex", []),
  };
}

export type WorkspacePresentationClient = ReturnType<
  typeof createWorkspacePresentationClient
>;
