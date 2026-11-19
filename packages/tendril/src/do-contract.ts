/**
 * Typed address of a TendrilDO (tendrils plan §5.2) for panels, eval and
 * workers. The DO itself lives in `workers/tendril`.
 */
import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import { doTargetId } from "@vibestudio/shared/workspaceServiceRpc";
import type {
  StateOp,
  TendrilAbout,
  TendrilCreateInput,
  TendrilDescription,
  TendrilFunctionDecl,
  TendrilPresentation,
} from "./protocol.js";

export interface TendrilRpc {
  create(input: TendrilCreateInput): Promise<TendrilDescription>;
  describe(): Promise<TendrilDescription>;
  setAbout(about: TendrilAbout): Promise<void>;
  getState(): Promise<{ rev: number; state: Record<string, unknown> }>;
  applyState(input: { cid: string; ops: StateOp[] }): Promise<{ rev: number }>;
  registerPresentation(p: TendrilPresentation): Promise<void>;
  unregisterPresentation(slotId: string): Promise<void>;
  registerFunctions(slotId: string, fns: TendrilFunctionDecl[]): Promise<void>;
}

export const tendrilRpcMethods = createReceiverRpcMethods<TendrilRpc>([
  "create",
  "describe",
  "setAbout",
  "getState",
  "applyState",
  "registerPresentation",
  "unregisterPresentation",
  "registerFunctions",
]);

export const TENDRIL_DO = { source: "workers/tendril", className: "TendrilDO" } as const;

export function tendrilTargetId(tendrilId: string): string {
  return doTargetId({ ...TENDRIL_DO, objectKey: tendrilId });
}

/** `panel.stateArgs.tendril`: what a tendril page needs to find its tendril. */
export interface TendrilStateArgs {
  tendrilId: string;
  channelId: string;
  contextId: string;
}

export function readTendrilStateArgs(stateArgs: unknown): TendrilStateArgs {
  const raw =
    stateArgs && typeof stateArgs === "object"
      ? (stateArgs as Record<string, unknown>)["tendril"]
      : undefined;
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const value = (key: keyof TendrilStateArgs) => {
    const v = record?.[key];
    if (typeof v !== "string" || !v)
      throw new Error(
        `This panel is not a tendril: stateArgs.tendril.${key} is missing. Open it with createTendril().present().`,
      );
    return v;
  };
  return { tendrilId: value("tendrilId"), channelId: value("channelId"), contextId: value("contextId") };
}
