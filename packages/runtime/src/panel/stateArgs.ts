import type { PanelSlotId } from "@vibestudio/shared/panel/idValues";
import {
  patchPanelStateArgs,
  readPanelStateArgs,
} from "../shared/panelStateArgsPersistence.js";

// Global injected by preload via --vibestudio-state-args command line arg
declare global {
  interface Window {
    __vibestudioStateArgs?: Record<string, unknown>;
  }
}

/** Wire snapshots are JSON values; retain identity for unchanged subtrees. */
function shareSnapshot(previous: unknown, next: unknown): unknown {
  if (Object.is(previous, next)) return previous;
  if (Array.isArray(previous) && Array.isArray(next)) {
    const shared = next.map((value, index) =>
      shareSnapshot(previous[index], value),
    );
    return previous.length === shared.length &&
      shared.every((value, index) => Object.is(value, previous[index]))
      ? previous
      : shared;
  }
  if (
    previous &&
    next &&
    typeof previous === "object" &&
    typeof next === "object" &&
    Object.getPrototypeOf(previous) === Object.prototype &&
    Object.getPrototypeOf(next) === Object.prototype
  ) {
    const old = previous as Record<string, unknown>;
    const entries = Object.entries(next);
    let unchanged = Object.keys(old).length === entries.length;
    const shared = Object.fromEntries(
      entries.map(([key, value]) => {
        const result = shareSnapshot(old[key], value);
        unchanged =
          unchanged && Object.hasOwn(old, key) && Object.is(result, old[key]);
        return [key, result];
      }),
    );
    return unchanged ? previous : shared;
  }
  return next;
}

export function createStateArgsRuntime(input: {
  slotId: PanelSlotId;
  call: <T>(service: string, method: string, args: unknown[]) => Promise<T>;
  initial?: Record<string, unknown>;
  changed?: (snapshot: Record<string, unknown>) => void;
}) {
  let snapshot = input.initial ?? {};
  const apply = (next: Record<string, unknown>) => {
    const shared = shareSnapshot(snapshot, next) as Record<string, unknown>;
    if (shared === snapshot) return;
    snapshot = shared;
    input.changed?.(snapshot);
  };
  const patchForPanel = async <T = Record<string, unknown>>(
    panelId: string,
    patch: Record<string, unknown>,
  ): Promise<T> => {
    const next = await patchPanelStateArgs({ call: input.call }, panelId, patch);
    if (panelId === input.slotId) {
      apply(next);
      return snapshot as T;
    }
    return next as T;
  };
  return {
    get: <T = Record<string, unknown>>(): T => snapshot as T,
    patch: <T = Record<string, unknown>>(patch: Record<string, unknown>) =>
      patchForPanel<T>(input.slotId, patch),
    patchForPanel,
    getForPanel: <T = Record<string, unknown>>(panelId: string) =>
      readPanelStateArgs<T>({ call: input.call }, panelId),
    apply,
  };
}

// The default panel import binds one instance. Explicit factories own their
// state independently and never replace this convenience binding.
let defaultState: ReturnType<typeof createStateArgsRuntime> | undefined;
export function bindDefaultStateArgs(
  state: ReturnType<typeof createStateArgsRuntime>,
): void {
  defaultState = state;
}
function current() {
  if (!defaultState) throw new Error("Panel runtime has not been initialized");
  return defaultState;
}
export function getStateArgs<T = Record<string, unknown>>(): T {
  return current().get<T>();
}
export function patchStateArgs<T = Record<string, unknown>>(
  patch: Record<string, unknown>,
): Promise<T> {
  return current().patch<T>(patch);
}
export function patchStateArgsForPanel<T = Record<string, unknown>>(
  panelId: string,
  patch: Record<string, unknown>,
): Promise<T> {
  return current().patchForPanel<T>(panelId, patch);
}
export function getStateArgsForPanel<T = Record<string, unknown>>(
  panelId: string,
): Promise<T> {
  return current().getForPanel<T>(panelId);
}
