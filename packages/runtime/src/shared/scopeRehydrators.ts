import type { PanelHandle } from "../core/types.js";
import { cdpSessionOf } from "../panel/cdpAutomation.js";
import { createNonPanelRuntimeHandle } from "./handles.js";

/** Reacquire live runtime objects persisted by the eval scope serializer. */
export function createRuntimeScopeRehydrators(
  getPanelHandle: (id: string) => PanelHandle,
): Readonly<Record<string, (id: string) => unknown>> {
  return {
    panel: (id) => getPanelHandle(id),
    worker: (id) => createNonPanelRuntimeHandle({ id, kind: "worker" }),
    do: (id) => createNonPanelRuntimeHandle({ id, kind: "do" }),
    "panel-cdp-session": (id) => cdpSessionOf(getPanelHandle(id).cdp),
  };
}
