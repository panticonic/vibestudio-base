import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";

export const QUICKFIRE_SERVICE_PROTOCOL = "vibestudio.quickfire.v1";

export interface QuickfireSession {
  slotId: string;
  channelId: string;
  channelTargetId: string;
  contextId: string;
  agentEntityId: string;
  state: "fresh" | "resumed" | "promoted";
  messageCount: number | null;
  lastActivityAt: number | null;
  createdAt: number;
  promotedAt: number | null;
}

export type QuickfireSessionSummary = Pick<
  QuickfireSession,
  | "slotId"
  | "channelId"
  | "channelTargetId"
  | "contextId"
  | "agentEntityId"
  | "createdAt"
  | "promotedAt"
>;

export interface QuickfireServiceClient {
  sessionFor(input: {
    slotId: string;
    fresh?: boolean;
  }): Promise<QuickfireSession>;
  clear(input: { slotId: string }): Promise<{ cleared: boolean }>;
  promote(input: { slotId: string }): Promise<QuickfireSession | null>;
  list(): Promise<QuickfireSession[]>;
}

/** Platform-neutral client ABI; the worker implements this same contract. */
export const quickfireRpcMethods =
  createReceiverRpcMethods<QuickfireServiceClient>([
    "sessionFor",
    "clear",
    "promote",
    "list",
  ]);
